package main

import (
	"context"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"api-gateway/internal/admin"
	"api-gateway/internal/gateway"
	"api-gateway/internal/registry"
	"api-gateway/mocks"
	"api-gateway/web"

	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
)

func main() {
	// Parse command line flags
	mockFlag := flag.Bool("mock", false, "Start mock backends for REST, SOAP, and gRPC sandbox testing")
	flag.Parse()

	// Initialize high-performance JSON structured logger
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	logger.Info("Starting TS API Gateway initialization...")

	// 1. Boot Mock Backends if flag is enabled
	if *mockFlag {
		logger.Info("Sandbox Mode: Booting mock backend server clusters (REST:8081/8082, SOAP:8083, gRPC:50051)...")
		mocks.BootAllMocks()
	} else {
		logger.Info("Production Mode: Active. No mock services are running. Standing by to route production traffic.")
	}

	// 2. Initialize Service Registry & active Health Checker
	reg := registry.NewRegistry(logger)

	// Pre-register default services is disabled. The Gateway now boots with a clean, empty service registry!
	// preRegisterDefaultServices(reg)

	// Active health checks run every 5 seconds
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	reg.StartHealthChecker(ctx, 5*time.Second)

	// 3. Initialize dynamic Proxy Engine
	gp := gateway.NewGatewayProxy(reg, logger)

	// 4. Initialize Admin API Control Plane Handler
	ah := admin.NewAdminHandler(reg, gp, logger)

	// 5. Construct routing multiplexer
	mainMux := http.NewServeMux()

	// Admin Control Plane REST Endpoints
	mainMux.Handle("/admin/api/", ah)

	// Admin Dashboard HTML Template
	mainMux.HandleFunc("/admin", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		htmlBytes, err := web.FS.ReadFile("templates/index.html")
		if err != nil {
			logger.Error("Failed to read embedded index.html", "error", err)
			http.Error(w, "Dashboard asset missing", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(htmlBytes)
	})

	// Static Assets Server (CSS, JS)
	mainMux.HandleFunc("/admin/static/", func(w http.ResponseWriter, r *http.Request) {
		filePath := "static/" + strings.TrimPrefix(r.URL.Path, "/admin/static/")
		
		// Parse and set content-type header
		if strings.HasSuffix(filePath, ".css") {
			w.Header().Set("Content-Type", "text/css; charset=utf-8")
		} else if strings.HasSuffix(filePath, ".js") {
			w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		}

		assetBytes, err := web.FS.ReadFile(filePath)
		if err != nil {
			http.Error(w, "Static asset not found", http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(assetBytes)
	})

	// Default Fallthrough: Data Plane Reverse Proxy
	mainMux.Handle("/", gp)

	// 6. Integrate Global Middleware Pipeline
	// Dynamically enforces rate-limits and JWT validation per microservice
	limiterManager := gateway.NewServiceRateLimiterManager()

	var handler http.Handler = mainMux
	handler = gateway.JWTAuthMiddleware(reg, handler)
	handler = gateway.RateLimitMiddleware(reg, limiterManager, handler)
	handler = gateway.LoggerMiddleware(logger, handler)
	handler = gateway.CORSMiddleware(handler)
	handler = gateway.RecoveryMiddleware(logger, handler)

	// 7. Establish Single-Port h2c Multiplexing
	// Multiplexes HTTP/1.1 (REST/SOAP) and HTTP/2 (gRPC Cleartext) on port 8080
	h2Server := &http2.Server{}
	server := &http.Server{
		Addr:    ":8080",
		Handler: h2c.NewHandler(handler, h2Server),
	}

	// 8. Graceful Shutdown Management
	go func() {
		logger.Info("TS API Gateway Server running on plain text port :8080...")
		logger.Info("Dashboard accessible at: http://localhost:8080/admin")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("Server listen failed", "error", err)
			os.Exit(1)
		}
	}()

	// Signal interception
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	logger.Info("Shutting down API Gateway gracefully...")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("Graceful shutdown failed", "error", err)
	} else {
		logger.Info("API Gateway completely stopped. Uptime cycle terminated.")
	}
}

// preRegisterDefaultServices sets up our system cluster defaults.
func preRegisterDefaultServices(reg *registry.Registry) {
	// A. Users Cluster (REST / Go) - Load balanced on ports 8081 and 8082
	userService := registry.NewMicroservice(
		"users-cluster",
		"Users Profile Service",
		"/api",
		registry.ProtocolREST,
		registry.StackGo,
		"/health",
		registry.LBRoundRobin,
	)
	userService.AddInstance(&registry.ServiceInstance{
		ID:        "users-node-1",
		URL:       "http://localhost:8081",
		Healthy:   false,
		LastCheck: time.Now(),
	})
	userService.AddInstance(&registry.ServiceInstance{
		ID:        "users-node-2",
		URL:       "http://localhost:8082",
		Healthy:   false,
		LastCheck: time.Now(),
	})
	reg.Register(userService)

	// B. SOAP Billing Service (SOAP / SOAP-Legacy) on port 8083
	soapService := registry.NewMicroservice(
		"soap-billing",
		"SOAP Legacy Billing API",
		"/soap",
		registry.ProtocolSOAP,
		registry.StackLegacySOAP,
		"/health",
		registry.LBRoundRobin,
	)
	soapService.AddInstance(&registry.ServiceInstance{
		ID:        "soap-node-1",
		URL:       "http://localhost:8083",
		Healthy:   false,
		LastCheck: time.Now(),
	})
	reg.Register(soapService)

	// C. High Performance Engine (gRPC / Go) on port 50051
	// Maps standard HealthCheck service prefix for gRPC testing
	grpcService := registry.NewMicroservice(
		"grpc-engine",
		"High Performance Core",
		"/grpc.health.v1.Health",
		registry.ProtocolGRPC,
		registry.StackGo,
		"", // gRPC health check uses active TCP dial on register/interval checks
		registry.LBRoundRobin,
	)
	grpcService.AddInstance(&registry.ServiceInstance{
		ID:        "grpc-node-1",
		URL:       "http://localhost:50051",
		Healthy:   false,
		LastCheck: time.Now(),
	})
	reg.Register(grpcService)
}
