package gateway

import (
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"api-gateway/internal/registry"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/time/rate"
)

var JWTSecret = []byte("api-gateway-super-secret-key-2026")

// LogEntry represents an HTTP transaction logged by the gateway.
type LogEntry struct {
	Timestamp time.Time `json:"timestamp"`
	IP        string    `json:"ip"`
	Method    string    `json:"method"`
	Path      string    `json:"path"`
	Status    int       `json:"status"`
	Latency   string    `json:"latency"`
}

var (
	LogBuffer []LogEntry
	LogMu     sync.RWMutex
	MaxLogs   = 50
)

func init() {
	LogBuffer = make([]LogEntry, 0, MaxLogs)
}

// AddLog adds a record to our in-memory dashboard log buffer.
func AddLog(ip, method, path string, status int, latency time.Duration) {
	LogMu.Lock()
	defer LogMu.Unlock()

	if len(LogBuffer) >= MaxLogs {
		LogBuffer = LogBuffer[1:]
	}

	LogBuffer = append(LogBuffer, LogEntry{
		Timestamp: time.Now(),
		IP:        ip,
		Method:    method,
		Path:      path,
		Status:    status,
		Latency:   latency.Round(time.Millisecond).String(),
	})
}

// GetLogs returns a copy of the in-memory circular log buffer.
func GetLogs() []LogEntry {
	LogMu.RLock()
	defer LogMu.RUnlock()

	copied := make([]LogEntry, len(LogBuffer))
	copy(copied, LogBuffer)
	return copied
}

// responseWriter is a custom wrapper to capture status code in middleware.
type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func newResponseWriter(w http.ResponseWriter) *responseWriter {
	return &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

// LoggerMiddleware records request/response metrics and forwards to dashboard logs.
func LoggerMiddleware(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip logging for admin asset/API polling requests to avoid flooding logs
		isInternal := strings.HasPrefix(r.URL.Path, "/admin") || strings.HasPrefix(r.URL.Path, "/favicon.ico")

		start := time.Now()
		rw := newResponseWriter(w)

		next.ServeHTTP(rw, r)

		latency := time.Since(start)

		// Resolve client IP (respect forwarding headers)
		ip := r.Header.Get("X-Forwarded-For")
		if ip == "" {
			ip, _, _ = net.SplitHostPort(r.RemoteAddr)
		}

		if !isInternal {
			AddLog(ip, r.Method, r.URL.Path, rw.statusCode, latency)
			logger.Info("HTTP Request",
				"ip", ip,
				"method", r.Method,
				"path", r.URL.Path,
				"status", rw.statusCode,
				"latency", latency.String(),
			)
		}
	})
}

// CORSMiddleware sets headers for dashboard/API browser calls.
func CORSMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// RecoveryMiddleware intercepts panics and prevents process crashes.
func RecoveryMiddleware(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				logger.Error("Panic recovered in HTTP handler", "error", err)
				http.Error(w, "Gateway Internal Server Error (Panic Recovered)", http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// IPRateLimiter maintains rate limiters per IP.
type IPRateLimiter struct {
	ips map[string]*rate.Limiter
	mu  sync.RWMutex
	r   rate.Limit
	b   int
}

func NewIPRateLimiter(r rate.Limit, b int) *IPRateLimiter {
	return &IPRateLimiter{
		ips: make(map[string]*rate.Limiter),
		r:   r,
		b:   b,
	}
}

func (i *IPRateLimiter) GetLimiter(ip string) *rate.Limiter {
	i.mu.RLock()
	limiter, exists := i.ips[ip]
	i.mu.RUnlock()

	if exists {
		return limiter
	}

	i.mu.Lock()
	defer i.mu.Unlock()

	// Double check lock
	limiter, exists = i.ips[ip]
	if exists {
		return limiter
	}

	limiter = rate.NewLimiter(i.r, i.b)
	i.ips[ip] = limiter
	return limiter
}

// ServiceRateLimiterManager manages rate limiters for all services dynamically.
type ServiceRateLimiterManager struct {
	limiters map[string]*IPRateLimiter
	mu       sync.RWMutex
}

func NewServiceRateLimiterManager() *ServiceRateLimiterManager {
	return &ServiceRateLimiterManager{
		limiters: make(map[string]*IPRateLimiter),
	}
}

// GetLimiter retrieves or creates a service-specific rate limiter.
// If limits have been dynamically updated on the control plane, it replaces the old limiter.
func (s *ServiceRateLimiterManager) GetLimiter(svcID string, r rate.Limit, b int) *IPRateLimiter {
	s.mu.RLock()
	lim, exists := s.limiters[svcID]
	s.mu.RUnlock()

	if exists {
		if lim.r != r || lim.b != b {
			s.mu.Lock()
			lim = NewIPRateLimiter(r, b)
			s.limiters[svcID] = lim
			s.mu.Unlock()
		}
		return lim
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	lim, exists = s.limiters[svcID]
	if exists {
		return lim
	}

	lim = NewIPRateLimiter(r, b)
	s.limiters[svcID] = lim
	return lim
}

// RateLimitMiddleware blocks IPs exceeding per-service rate thresholds.
func RateLimitMiddleware(reg *registry.Registry, manager *ServiceRateLimiterManager, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Exclude admin API and assets from rate limits
		if strings.HasPrefix(r.URL.Path, "/admin") {
			next.ServeHTTP(w, r)
			return
		}

		svc, _, matched := reg.MatchRoute(r.URL.Path)
		if matched && svc.RateLimitLimit > 0 {
			ip, _, _ := net.SplitHostPort(r.RemoteAddr)
			limiter := manager.GetLimiter(svc.ID, rate.Limit(svc.RateLimitLimit), svc.RateLimitBurst)
			lim := limiter.GetLimiter(ip)

			if !lim.Allow() {
				http.Error(w, "Gateway Error: Too Many Requests (Service '"+svc.Name+"' rate limit exceeded)", http.StatusTooManyRequests)
				return
			}
		}

		next.ServeHTTP(w, r)
	})
}

// JWTAuthMiddleware enforces authentication dynamically on a per-service level.
func JWTAuthMiddleware(reg *registry.Registry, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Exclude admin API and assets from validation
		if strings.HasPrefix(r.URL.Path, "/admin") {
			next.ServeHTTP(w, r)
			return
		}

		svc, _, matched := reg.MatchRoute(r.URL.Path)
		if matched && svc.RequiresAuth {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				http.Error(w, "Gateway Error: Unauthorized (Missing Authorization Token for "+svc.Name+")", http.StatusUnauthorized)
				return
			}

			parts := strings.Split(authHeader, " ")
			if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
				http.Error(w, "Gateway Error: Unauthorized (Invalid Authorization Header Format)", http.StatusUnauthorized)
				return
			}

			tokenStr := parts[1]
			token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
				}
				return JWTSecret, nil
			})

			if err != nil || !token.Valid {
				http.Error(w, "Gateway Error: Unauthorized (Token is invalid or expired for "+svc.Name+")", http.StatusUnauthorized)
				return
			}
		}

		next.ServeHTTP(w, r)
	})
}

// GenerateMockJWT creates a valid token signed with the gateway's key for testing.
func GenerateMockJWT(subject string, duration time.Duration) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": subject,
		"iat": time.Now().Unix(),
		"exp": time.Now().Add(duration).Unix(),
		"iss": "api-gateway",
	})
	return token.SignedString(JWTSecret)
}

// Helper to assist checking prefix in package-local files.
func stringsHasPrefix(s, prefix string) bool {
	return strings.HasPrefix(s, prefix)
}
