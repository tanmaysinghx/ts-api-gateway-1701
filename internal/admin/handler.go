package admin

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"api-gateway/internal/gateway"
	"api-gateway/internal/registry"
)

// AdminHandler manages the management endpoints.
type AdminHandler struct {
	reg    *registry.Registry
	proxy  *gateway.GatewayProxy
	logger *slog.Logger
}

// NewAdminHandler instantiates the control plane handler.
func NewAdminHandler(reg *registry.Registry, proxy *gateway.GatewayProxy, logger *slog.Logger) *AdminHandler {
	return &AdminHandler{
		reg:    reg,
		proxy:  proxy,
		logger: logger,
	}
}

// RegisterPayload matches the JSON schema to register a microservice.
type RegisterPayload struct {
	ID                 string   `json:"id"`
	Name               string   `json:"name"`
	Prefix             string   `json:"prefix"`
	Protocol           string   `json:"protocol"`   // "REST", "gRPC", "SOAP"
	TechStack          string   `json:"tech_stack"` // "Go", "Spring Boot", etc.
	HealthCheckPath    string   `json:"health_check_path"`
	LoadBalancerPolicy string   `json:"load_balancer_policy"` // "RoundRobin", "Random", "LeastConnections"
	Instances          []string `json:"instances"`            // List of URLs, e.g. ["http://localhost:8081"]
	RequiresAuth       bool     `json:"requires_auth"`
	RateLimitLimit     float64  `json:"rate_limit_limit"`
	RateLimitBurst     int      `json:"rate_limit_burst"`
}

// ServeHTTP routes the incoming control plane request using standard library elements.
func (ah *AdminHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Enable CORS for all admin endpoints
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	path := r.URL.Path

	switch {
	case path == "/admin/api/login" && r.Method == "POST":
		ah.handleLogin(w, r)
	case path == "/admin/api/services" && r.Method == "GET":
		ah.handleListServices(w, r)
	case path == "/admin/api/services" && r.Method == "POST":
		ah.handleRegisterService(w, r)
	case strings.HasPrefix(path, "/admin/api/services/") && r.Method == "DELETE":
		ah.handleDeregisterService(w, r)
	case path == "/admin/api/stats" && r.Method == "GET":
		ah.handleGetStats(w, r)
	case path == "/admin/api/logs" && r.Method == "GET":
		ah.handleGetLogs(w, r)
	case path == "/admin/api/token" && r.Method == "POST":
		ah.handleGenerateToken(w, r)
	default:
		http.Error(w, "Admin Endpoint Not Found", http.StatusNotFound)
	}
}

func (ah *AdminHandler) handleListServices(w http.ResponseWriter, r *http.Request) {
	services := ah.reg.GetServices()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(services)
}

func (ah *AdminHandler) handleRegisterService(w http.ResponseWriter, r *http.Request) {
	var payload RegisterPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid payload JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Validate inputs
	if payload.ID == "" || payload.Name == "" || payload.Prefix == "" {
		http.Error(w, "ID, Name, and Prefix are required parameters", http.StatusBadRequest)
		return
	}

	// Format protocol
	proto := registry.ProtocolREST
	switch strings.ToUpper(payload.Protocol) {
	case "GRPC":
		proto = registry.ProtocolGRPC
	case "SOAP":
		proto = registry.ProtocolSOAP
	}

	// Format load balancer policy
	lb := registry.LBRoundRobin
	switch payload.LoadBalancerPolicy {
	case "Random":
		lb = registry.LBRandom
	case "LeastConnections":
		lb = registry.LBLeastConnections
	}

	// Create service
	svc := registry.NewMicroservice(
		payload.ID,
		payload.Name,
		payload.Prefix,
		proto,
		registry.TechStack(payload.TechStack),
		payload.HealthCheckPath,
		lb,
	)
	svc.RequiresAuth = payload.RequiresAuth
	svc.RateLimitLimit = payload.RateLimitLimit
	svc.RateLimitBurst = payload.RateLimitBurst

	// Add instances
	for i, instURL := range payload.Instances {
		inst := &registry.ServiceInstance{
			ID:        payload.ID + "-instance-" + string(rune('1'+i)),
			URL:       instURL,
			Healthy:   false, // Starts as unhealthy until health-checker verifies
			LastCheck: time.Now(),
		}
		svc.AddInstance(inst)
	}

	ah.reg.Register(svc)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_, _ = w.Write([]byte(`{"status":"success","message":"Microservice registered successfully"}`))
}

func (ah *AdminHandler) handleDeregisterService(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/admin/api/services/")
	if id == "" {
		http.Error(w, "Service ID is required", http.StatusBadRequest)
		return
	}

	success := ah.reg.Deregister(id)
	w.Header().Set("Content-Type", "application/json")
	if success {
		_, _ = w.Write([]byte(`{"status":"success","message":"Microservice deregistered"}`))
	} else {
		http.Error(w, `{"status":"error","message":"Microservice not found"}`, http.StatusNotFound)
	}
}

func (ah *AdminHandler) handleGetStats(w http.ResponseWriter, r *http.Request) {
	stats := ah.proxy.GetStats()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(stats)
}

func (ah *AdminHandler) handleGetLogs(w http.ResponseWriter, r *http.Request) {
	logs := gateway.GetLogs()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(logs)
}

func (ah *AdminHandler) handleGenerateToken(w http.ResponseWriter, r *http.Request) {
	token, err := gateway.GenerateMockJWT("admin-dashboard-user", 24*time.Hour)
	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		http.Error(w, `{"status":"error","message":"failed to sign token"}`, http.StatusInternalServerError)
		return
	}

	_, _ = w.Write([]byte(`{"status":"success","token":"` + token + `"}`))
}

type LoginPayload struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (ah *AdminHandler) handleLogin(w http.ResponseWriter, r *http.Request) {
	var payload LoginPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"status":"error","message":"Invalid request body"}`))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if payload.Username == "tanmaysinghx@gmail.com" && payload.Password == "Tanmay@1999" {
		token, err := gateway.GenerateMockJWT("tanmaysinghx@gmail.com", 24*time.Hour)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte(`{"status":"error","message":"Failed to generate session token"}`))
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"success","token":"` + token + `"}`))
		return
	}

	w.WriteHeader(http.StatusUnauthorized)
	_, _ = w.Write([]byte(`{"status":"error","message":"Invalid admin username or password"}`))
}
