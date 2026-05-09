package registry

import (
	"sync"
	"time"
)

// ServiceProtocol represents the networking protocol of the microservice.
type ServiceProtocol string

const (
	ProtocolREST ServiceProtocol = "REST"
	ProtocolGRPC ServiceProtocol = "gRPC"
	ProtocolSOAP ServiceProtocol = "SOAP"
)

// TechStack represents the programming language/framework stack of the microservice.
type TechStack string

const (
	StackGo         TechStack = "Go"
	StackSpringBoot TechStack = "Spring Boot"
	StackNodeJS     TechStack = "Node.js"
	StackPython     TechStack = "Python"
	StackDotNet     TechStack = "C# .NET"
	StackLegacySOAP TechStack = "SOAP-Legacy"
)

// LBPolicy represents the load-balancing strategy for the service.
type LBPolicy string

const (
	LBRoundRobin        LBPolicy = "RoundRobin"
	LBRandom            LBPolicy = "Random"
	LBLeastConnections  LBPolicy = "LeastConnections"
)

// ServiceInstance represents a single running container/process of a microservice.
type ServiceInstance struct {
	ID                string        `json:"id"`
	URL               string        `json:"url"` // Address of the backend, e.g. "http://localhost:8081" or "localhost:50051"
	Healthy           bool          `json:"healthy"`
	LastCheck         time.Time     `json:"last_check"`
	Latency           time.Duration `json:"latency"`
	ActiveConnections int64         `json:"active_connections"` // Atomic tracking for Least Connections load balancing
}

// Microservice represents a group of instances forming a backend microservice.
type Microservice struct {
	ID                 string             `json:"id"`
	Name               string             `json:"name"`
	Prefix             string             `json:"prefix"` // Route prefix, e.g. "/api/v1/auth" or "/grpc.health.v1"
	Protocol           ServiceProtocol    `json:"protocol"`
	TechStack          TechStack          `json:"tech_stack"`
	HealthCheckPath    string             `json:"health_check_path"` // e.g. "/health" for REST, or standard for gRPC
	LoadBalancerPolicy LBPolicy           `json:"load_balancer_policy"`
	RequiresAuth       bool               `json:"requires_auth"`
	RateLimitLimit     float64            `json:"rate_limit_limit"` // Requests/sec (0 = disabled)
	RateLimitBurst     int                `json:"rate_limit_burst"` // Burst capacity
	Instances          []*ServiceInstance `json:"instances"`
	mu                 sync.RWMutex       // Mutex protecting this specific service's instances
}

// NewMicroservice initializes a microservice with its lock.
func NewMicroservice(id, name, prefix string, proto ServiceProtocol, tech TechStack, healthPath string, lb LBPolicy) *Microservice {
	return &Microservice{
		ID:                 id,
		Name:               name,
		Prefix:             prefix,
		Protocol:           proto,
		TechStack:          tech,
		HealthCheckPath:    healthPath,
		LoadBalancerPolicy: lb,
		Instances:          make([]*ServiceInstance, 0),
	}
}

// GetInstances returns a copy of instances in a thread-safe manner.
func (m *Microservice) GetInstances() []*ServiceInstance {
	m.mu.RLock()
	defer m.mu.RUnlock()
	copied := make([]*ServiceInstance, len(m.Instances))
	copy(copied, m.Instances)
	return copied
}

// AddInstance appends a new instance to the service thread-safely.
func (m *Microservice) AddInstance(inst *ServiceInstance) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Instances = append(m.Instances, inst)
}

// RemoveInstance removes an instance by its URL/Address.
func (m *Microservice) RemoveInstance(url string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i, inst := range m.Instances {
		if inst.URL == url {
			m.Instances = append(m.Instances[:i], m.Instances[i+1:]...)
			break
		}
	}
}
