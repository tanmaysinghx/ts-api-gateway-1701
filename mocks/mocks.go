package mocks

import (
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	"google.golang.org/grpc/health/grpc_health_v1"
)

// StartMockRESTServer boots a mock REST service on the given port.
func StartMockRESTServer(port int) {
	mux := http.NewServeMux()

	// Base health check
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(fmt.Sprintf(`{"status":"UP","port":%d,"timestamp":"%s"}`, port, time.Now().Format(time.RFC3339))))
	})

	// User service endpoint
	mux.HandleFunc("/users", func(w http.ResponseWriter, r *http.Request) {
		// Simulate slight network latency (10ms - 50ms) to make dashboard metrics look realistic and alive!
		time.Sleep(time.Duration(15+port%10) * time.Millisecond)

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Backend-Server", fmt.Sprintf("REST-Server:%d", port))
		
		response := fmt.Sprintf(`[
			{"id":1,"name":"Alice Vance","email":"alice@example.com","handled_by":"Port %d"},
			{"id":2,"name":"Bob Sterling","email":"bob@example.com","handled_by":"Port %d"}
		]`, port, port)
		_, _ = w.Write([]byte(response))
	})

	// Secured API Endpoint (requires gateway to have validated JWT claims)
	mux.HandleFunc("/secured/data", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(fmt.Sprintf(`{
			"status": "Success",
			"message": "Access Granted! This resource is protected by JWT validation.",
			"backend_node": "REST-Server:%d",
			"timestamp": "%s"
		}`, port, time.Now().Format(time.RFC3339))))
	})

	server := &http.Server{
		Addr:    fmt.Sprintf(":%d", port),
		Handler: mux,
	}

	log.Printf("Starting Mock REST Service node on port %d...", port)
	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("REST Server error on port %d: %v", port, err)
		}
	}()
}

// StartMockSOAPServer boots a mock legacy SOAP XML service.
func StartMockSOAPServer(port int) {
	mux := http.NewServeMux()

	// Health check
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/xml")
		_, _ = w.Write([]byte(`<Health><Status>UP</Status><Service>SOAP-WSDL-Service</Service></Health>`))
	})

	// SOAP POST Handler
	mux.HandleFunc("/ws/users", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			w.WriteHeader(http.StatusMethodNotAllowed)
			_, _ = w.Write([]byte("Only SOAP POST requests allowed"))
			return
		}

		bodyBytes, err := io.ReadAll(r.Body)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		bodyStr := string(bodyBytes)

		// Parse basic mock SOAP payload
		var userName = "Unknown SOAP User"
		if strings.Contains(bodyStr, "<UserId>1</UserId>") {
			userName = "Gregory House, MD"
		} else if strings.Contains(bodyStr, "<UserId>2</UserId>") {
			userName = "Lisa Cuddy, PhD"
		}

		// Simulate latency
		time.Sleep(30 * time.Millisecond)

		w.Header().Set("Content-Type", "text/xml; charset=utf-8")
		w.Header().Set("X-SOAP-Action", r.Header.Get("SOAPAction"))

		// Return fully formed XML SOAP envelope
		soapResponse := fmt.Sprintf(`<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:web="http://example.com/api-gateway/soap">
   <soapenv:Header/>
   <soapenv:Body>
      <web:GetUserResponse>
         <web:User>
            <web:Id>1</web:Id>
            <web:Name>%s</web:Name>
            <web:Status>Active</web:Status>
            <web:Platform>Legacy SOAP v1.1</web:Platform>
            <web:Node>SOAP-Server-Port-%d</web:Node>
            <web:Timestamp>%s</web:Timestamp>
         </web:User>
      </web:GetUserResponse>
   </soapenv:Body>
</soapenv:Envelope>`, userName, port, time.Now().Format(time.RFC3339))

		_, _ = w.Write([]byte(soapResponse))
	})

	server := &http.Server{
		Addr:    fmt.Sprintf(":%d", port),
		Handler: mux,
	}

	log.Printf("Starting Mock SOAP Service on port %d...", port)
	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("SOAP Server error: %v", err)
		}
	}()
}

// StartMockGRPCServer boots a 100% compliant binary gRPC Health Check service.
func StartMockGRPCServer(port int) {
	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		log.Fatalf("failed to listen for gRPC on port %d: %v", port, err)
	}

	s := grpc.NewServer()

	// Register Standard Health Service to provide authentic health states
	// without forcing custom proto files.
	healthSrv := health.NewServer()
	grpc_health_v1.RegisterHealthServer(s, healthSrv)
	
	// Set serving status to serving
	healthSrv.SetServingStatus("", grpc_health_v1.HealthCheckResponse_SERVING)
	healthSrv.SetServingStatus("grpc.health.v1.Health", grpc_health_v1.HealthCheckResponse_SERVING)

	log.Printf("Starting Mock binary gRPC Service on port %d...", port)
	go func() {
		if err := s.Serve(lis); err != nil {
			log.Printf("gRPC Server error: %v", err)
		}
	}()
}

// StopMocksHelper is a wrapper to clean up if necessary, but goroutines are fine for our run scope.
func BootAllMocks() {
	// 1. Two REST cluster instances for Load-Balancing
	StartMockRESTServer(8081)
	StartMockRESTServer(8082)

	// 2. Legacy SOAP Service
	StartMockSOAPServer(8083)

	// 3. Binary gRPC over HTTP2
	StartMockGRPCServer(50051)
	
	log.Printf("All microservice backend nodes booted successfully! (REST:8081/8082, SOAP:8083, gRPC:50051)")
}
