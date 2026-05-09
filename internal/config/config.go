package config

import (
	"time"
)

// GatewayConfig holds all operational configurations for the gateway engine.
type GatewayConfig struct {
	Port                string        `json:"port"`                  // e.g. ":8080"
	HealthCheckInterval time.Duration `json:"health_check_interval"` // e.g. 5s
	RateLimitRequests   float64       `json:"rate_limit_requests"`   // Requests per second limit
	RateLimitBurst      int           `json:"rate_limit_burst"`      // Burst limit
	JWTSecret           string        `json:"jwt_secret"`
}

// DefaultConfig returns a preconfigured settings payload ready for production bootstrap.
func DefaultConfig() *GatewayConfig {
	return &GatewayConfig{
		Port:                ":8080",
		HealthCheckInterval: 5 * time.Second,
		RateLimitRequests:   10.0,
		RateLimitBurst:      15,
		JWTSecret:           "api-gateway-super-secret-key-2026",
	}
}
