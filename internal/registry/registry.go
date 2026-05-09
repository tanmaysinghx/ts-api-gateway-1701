package registry

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Registry manages all registered microservices and coordinates background health checks.
type Registry struct {
	services map[string]*Microservice
	mu       sync.RWMutex
	logger   *slog.Logger
	client   *http.Client
}

// NewRegistry initializes a new service registry.
func NewRegistry(logger *slog.Logger) *Registry {
	return &Registry{
		services: make(map[string]*Microservice),
		logger:   logger,
		client: &http.Client{
			Timeout: 3 * time.Second,
		},
	}
}

// Register adds or updates a microservice in the registry.
func (r *Registry) Register(svc *Microservice) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.services[svc.ID] = svc
	r.logger.Info("Registered microservice", "id", svc.ID, "prefix", svc.Prefix, "protocol", svc.Protocol, "tech", svc.TechStack)
}

// Deregister removes a microservice from the registry.
func (r *Registry) Deregister(id string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, exists := r.services[id]; exists {
		delete(r.services, id)
		r.logger.Info("Deregistered microservice", "id", id)
		return true
	}
	return false
}

// GetServices returns a list of all currently registered microservices.
func (r *Registry) GetServices() []*Microservice {
	r.mu.RLock()
	defer r.mu.RUnlock()
	list := make([]*Microservice, 0, len(r.services))
	for _, svc := range r.services {
		list = append(list, svc)
	}
	return list
}

// GetService retrieves a service by its ID.
func (r *Registry) GetService(id string) (*Microservice, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	svc, exists := r.services[id]
	return svc, exists
}

// MatchRoute scans registered services and finds the longest matching route prefix.
// It returns the matched Microservice and the trimmed path suffix (remaining path).
func (r *Registry) MatchRoute(path string) (*Microservice, string, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var bestMatch *Microservice
	longestPrefixLen := -1

	for _, svc := range r.services {
		// Ensure matches happen at path boundaries or exact matches
		prefix := svc.Prefix
		if !strings.HasPrefix(prefix, "/") {
			prefix = "/" + prefix
		}

		if strings.HasPrefix(path, prefix) {
			// Check if the match is on a directory boundary (e.g., prefix "/users" matching "/users/1" or "/users")
			prefixLen := len(prefix)
			if len(path) == prefixLen || path[prefixLen] == '/' {
				if prefixLen > longestPrefixLen {
					longestPrefixLen = prefixLen
					bestMatch = svc
				}
			}
		}
	}

	if bestMatch != nil {
		remainingPath := path[longestPrefixLen:]
		if !strings.HasPrefix(remainingPath, "/") {
			remainingPath = "/" + remainingPath
		}
		return bestMatch, remainingPath, true
	}

	return nil, "", false
}

// StartHealthChecker kicks off an active background routine to check all registered instances.
func (r *Registry) StartHealthChecker(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	r.logger.Info("Starting active health checker", "interval", interval)

	go func() {
		// Run an initial check immediately
		r.checkAllHealth()

		for {
			select {
			case <-ticker.C:
				r.checkAllHealth()
			case <-ctx.Done():
				ticker.Stop()
				r.logger.Info("Health checker stopped")
				return
			}
		}
	}()
}

// checkAllHealth iterates through every registered instance and performs pings.
func (r *Registry) checkAllHealth() {
	services := r.GetServices()

	var wg sync.WaitGroup
	for _, svc := range services {
		instances := svc.GetInstances()
		for _, inst := range instances {
			wg.Add(1)
			go func(s *Microservice, i *ServiceInstance) {
				defer wg.Done()
				r.checkInstanceHealth(s, i)
			}(svc, inst)
		}
	}
	wg.Wait()
}

// checkInstanceHealth checks health based on protocol.
func (r *Registry) checkInstanceHealth(svc *Microservice, inst *ServiceInstance) {
	start := time.Now()

	var healthy bool
	if svc.Protocol == ProtocolGRPC {
		// For gRPC, perform active TCP dial to the service port
		// Extends nicely without forcing protobuf dependencies
		u, err := url.Parse(inst.URL)
		host := inst.URL
		if err == nil && u.Host != "" {
			host = u.Host
		} else {
			// If raw "localhost:50051"
			host = strings.TrimPrefix(host, "http://")
			host = strings.TrimPrefix(host, "https://")
		}

		conn, err := net.DialTimeout("tcp", host, 2*time.Second)
		if err != nil {
			healthy = false
			r.logger.Warn("gRPC Instance Health Check Failed", "id", inst.ID, "url", inst.URL, "error", err.Error())
		} else {
			_ = conn.Close()
			healthy = true
		}
	} else {
		// REST or SOAP - standard HTTP check
		healthURL := fmt.Sprintf("%s%s", strings.TrimSuffix(inst.URL, "/"), svc.HealthCheckPath)
		resp, err := r.client.Get(healthURL)
		if err != nil {
			healthy = false
			r.logger.Warn("HTTP Instance Health Check Failed", "id", inst.ID, "url", healthURL, "error", err.Error())
		} else {
			_ = resp.Body.Close()
			// Consider 2xx and 3xx codes as healthy
			healthy = resp.StatusCode >= 200 && resp.StatusCode < 400
			if !healthy {
				r.logger.Warn("HTTP Instance Unhealthy status code", "id", inst.ID, "url", healthURL, "code", resp.StatusCode)
			}
		}
	}

	latency := time.Since(start)

	// Update the service instance under internal write lock
	svc.mu.Lock()
	defer svc.mu.Unlock()
	inst.Healthy = healthy
	inst.LastCheck = time.Now()
	if healthy {
		inst.Latency = latency
	} else {
		inst.Latency = 0
	}
}
