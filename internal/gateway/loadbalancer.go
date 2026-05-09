package gateway

import (
	"errors"
	"math/rand"
	"sync"
	"sync/atomic"
	"time"

	"api-gateway/internal/registry"
)

var (
	ErrNoHealthyInstances = errors.New("no healthy instances available for this service")
)

// LoadBalancer defines the interface for selecting a service instance.
type LoadBalancer interface {
	SelectInstance(svc *registry.Microservice) (*registry.ServiceInstance, error)
}

// RoundRobinLoadBalancer selects instances sequentially.
type RoundRobinLoadBalancer struct {
	mu      sync.Mutex
	indices map[string]uint32
}

func NewRoundRobinLoadBalancer() *RoundRobinLoadBalancer {
	return &RoundRobinLoadBalancer{
		indices: make(map[string]uint32),
	}
}

func (rr *RoundRobinLoadBalancer) SelectInstance(svc *registry.Microservice) (*registry.ServiceInstance, error) {
	instances := svc.GetInstances()
	healthy := make([]*registry.ServiceInstance, 0)
	for _, inst := range instances {
		if inst.Healthy {
			healthy = append(healthy, inst)
		}
	}

	if len(healthy) == 0 {
		return nil, ErrNoHealthyInstances
	}

	rr.mu.Lock()
	idx := rr.indices[svc.ID]
	rr.indices[svc.ID] = idx + 1
	rr.mu.Unlock()

	selectedIdx := idx % uint32(len(healthy))
	return healthy[selectedIdx], nil
}

// RandomLoadBalancer selects instances randomly.
type RandomLoadBalancer struct {
	rng *rand.Rand
	mu  sync.Mutex
}

func NewRandomLoadBalancer() *RandomLoadBalancer {
	return &RandomLoadBalancer{
		rng: rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

func (rl *RandomLoadBalancer) SelectInstance(svc *registry.Microservice) (*registry.ServiceInstance, error) {
	instances := svc.GetInstances()
	healthy := make([]*registry.ServiceInstance, 0)
	for _, inst := range instances {
		if inst.Healthy {
			healthy = append(healthy, inst)
		}
	}

	if len(healthy) == 0 {
		return nil, ErrNoHealthyInstances
	}

	rl.mu.Lock()
	idx := rl.rng.Intn(len(healthy))
	rl.mu.Unlock()

	return healthy[idx], nil
}

// LeastConnectionsLoadBalancer selects the instance with the fewest active requests.
type LeastConnectionsLoadBalancer struct{}

func NewLeastConnectionsLoadBalancer() *LeastConnectionsLoadBalancer {
	return &LeastConnectionsLoadBalancer{}
}

func (lc *LeastConnectionsLoadBalancer) SelectInstance(svc *registry.Microservice) (*registry.ServiceInstance, error) {
	instances := svc.GetInstances()
	healthy := make([]*registry.ServiceInstance, 0)
	for _, inst := range instances {
		if inst.Healthy {
			healthy = append(healthy, inst)
		}
	}

	if len(healthy) == 0 {
		return nil, ErrNoHealthyInstances
	}

	// Find the instance with minimum active connections
	var selected *registry.ServiceInstance
	minConns := int64(^uint64(0) >> 1) // Max int64

	for _, inst := range healthy {
		conns := atomic.LoadInt64(&inst.ActiveConnections)
		if conns < minConns {
			minConns = conns
			selected = inst
		}
	}

	if selected == nil {
		return healthy[0], nil
	}

	return selected, nil
}

// Dispatcher coordinates load balancing and routes traffic.
type Dispatcher struct {
	rr LoadBalancer
	rd LoadBalancer
	lc LoadBalancer
}

func NewDispatcher() *Dispatcher {
	return &Dispatcher{
		rr: NewRoundRobinLoadBalancer(),
		rd: NewRandomLoadBalancer(),
		lc: NewLeastConnectionsLoadBalancer(),
	}
}

// SelectInstance matches the service policy to select an instance.
func (d *Dispatcher) SelectInstance(svc *registry.Microservice) (*registry.ServiceInstance, error) {
	switch svc.LoadBalancerPolicy {
	case registry.LBRoundRobin:
		return d.rr.SelectInstance(svc)
	case registry.LBRandom:
		return d.rd.SelectInstance(svc)
	case registry.LBLeastConnections:
		return d.lc.SelectInstance(svc)
	default:
		return d.rr.SelectInstance(svc)
	}
}
