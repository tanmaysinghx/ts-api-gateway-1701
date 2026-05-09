package gateway

import (
	"context"
	"crypto/tls"
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"api-gateway/internal/registry"

	"golang.org/x/net/http2"
)

// ProxyStats tracks runtime metrics for the dashboard.
type ProxyStats struct {
	TotalRequests     uint64            `json:"total_requests"`
	ActiveConnections int64             `json:"active_connections"`
	TotalErrors       uint64            `json:"total_errors"`
	ServiceRequests   map[string]uint64 `json:"service_requests"`
	ServiceLatency    map[string]string `json:"service_latency"` // average latency formatted as string
	mu                sync.RWMutex
}

func NewProxyStats() *ProxyStats {
	return &ProxyStats{
		ServiceRequests: make(map[string]uint64),
		ServiceLatency:  make(map[string]string),
	}
}

// GatewayProxy acts as the main HTTP handler forwarding traffic.
type GatewayProxy struct {
	registry   *registry.Registry
	dispatcher *Dispatcher
	logger     *slog.Logger
	stats      *ProxyStats

	// Transports for backend routing
	httpTransport *http.Transport
	grpcTransport *http2.Transport
}

// NewGatewayProxy creates a new gateway reverse-proxy handler.
func NewGatewayProxy(reg *registry.Registry, logger *slog.Logger) *GatewayProxy {
	// Standard HTTP transport for REST/SOAP
	httpTransport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}

	// High-performance H2C transport for proxying gRPC (HTTP/2 cleartext)
	grpcTransport := &http2.Transport{
		AllowHTTP: true,
		DialTLSContext: func(ctx context.Context, network, addr string, cfg *tls.Config) (net.Conn, error) {
			var d net.Dialer
			return d.DialContext(ctx, network, addr)
		},
	}

	return &GatewayProxy{
		registry:      reg,
		dispatcher:    NewDispatcher(),
		logger:        logger,
		stats:         NewProxyStats(),
		httpTransport: httpTransport,
		grpcTransport: grpcTransport,
	}
}

func (gp *GatewayProxy) GetStats() *ProxyStats {
	return gp.stats
}

func (gp *GatewayProxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	atomic.AddUint64(&gp.stats.TotalRequests, 1)
	atomic.AddInt64(&gp.stats.ActiveConnections, 1)
	defer atomic.AddInt64(&gp.stats.ActiveConnections, -1)

	startTime := time.Now()

	// 1. Match path to microservice
	svc, remainingPath, matched := gp.registry.MatchRoute(r.URL.Path)
	if !matched {
		atomic.AddUint64(&gp.stats.TotalErrors, 1)
		gp.logger.Warn("Route match failed", "path", r.URL.Path, "method", r.Method)
		http.Error(w, "Gateway Routing Error: No registered microservice matches this path.", http.StatusNotFound)
		return
	}

	// Update per-service stats
	gp.stats.mu.Lock()
	gp.stats.ServiceRequests[svc.ID]++
	gp.stats.mu.Unlock()

	// 2. Select instance via dispatcher load balancer
	inst, err := gp.dispatcher.SelectInstance(svc)
	if err != nil {
		atomic.AddUint64(&gp.stats.TotalErrors, 1)
		gp.logger.Error("Load balancer instance selection failed", "service", svc.ID, "error", err.Error())
		http.Error(w, "Gateway Load Balancing Error: "+err.Error(), http.StatusServiceUnavailable)
		return
	}

	// Track dynamic active connections per instance (Least Connections support)
	atomic.AddInt64(&inst.ActiveConnections, 1)
	defer atomic.AddInt64(&inst.ActiveConnections, -1)

	// parse target backend address
	targetURL, err := url.Parse(inst.URL)
	if err != nil {
		atomic.AddUint64(&gp.stats.TotalErrors, 1)
		gp.logger.Error("Failed to parse backend URL", "url", inst.URL, "error", err.Error())
		http.Error(w, "Gateway Internal Error: Invalid backend configuration.", http.StatusInternalServerError)
		return
	}

	// 3. Create reverse proxy
	proxy := &httputil.ReverseProxy{
		Director: func(req *http.Request) {
			req.URL.Scheme = targetURL.Scheme
			req.URL.Host = targetURL.Host

			if svc.Protocol == registry.ProtocolGRPC {
				// gRPC expects exact full paths (/package.Service/Method)
				// Do not strip prefix
				req.URL.Path = r.URL.Path
			} else {
				// REST and SOAP strip the prefix for cleaner sub-routes
				req.URL.Path = remainingPath
			}

			// Forward query strings
			req.URL.RawQuery = r.URL.RawQuery

			// Pass headers
			if _, ok := req.Header["User-Agent"]; !ok {
				// Prevent default Go user-agent
				req.Header.Set("User-Agent", "")
			}
			req.Header.Set("X-Forwarded-Host", r.Host)
			req.Header.Set("X-Origin-Prefix", svc.Prefix)
		},
		ErrorHandler: func(w http.ResponseWriter, req *http.Request, err error) {
			atomic.AddUint64(&gp.stats.TotalErrors, 1)
			gp.logger.Error("Proxy forwarding error", "service", svc.ID, "target", inst.URL, "error", err.Error())
			http.Error(w, "Gateway Proxy Forwarding Error: "+err.Error(), http.StatusBadGateway)
		},
	}

	// 4. Multiplex outgoing connection transport
	isGRPC := svc.Protocol == registry.ProtocolGRPC || strings.HasPrefix(r.Header.Get("Content-Type"), "application/grpc")
	if isGRPC {
		// Route over HTTP/2 Cleartext
		proxy.Transport = gp.grpcTransport
	} else {
		// Standard HTTP/1.1 route
		proxy.Transport = gp.httpTransport
	}

	// 5. Execute proxy request
	proxy.ServeHTTP(w, r)

	// 6. Record latency metric
	latency := time.Since(startTime)
	gp.stats.mu.Lock()
	gp.stats.ServiceLatency[svc.ID] = latency.Round(time.Millisecond).String()
	gp.stats.mu.Unlock()
}
