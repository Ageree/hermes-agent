package main

import (
	"context"
	"crypto/ecdsa"
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	pb "stealthpay/tss/proto"
	"stealthpay/tss/internal/dkg"
	"stealthpay/tss/internal/signing"
)

var (
	port     = flag.Int("port", 50051, "The server port")
	host     = flag.String("host", "0.0.0.0", "The server host")
	nodeID   = flag.String("node-id", "", "Unique node identifier")
)

// TSSServer implements the TSSService gRPC interface
type TSSServer struct {
	pb.UnimplementedTSSServiceServer
	nodeID    string
	dkgSvc    *dkg.Service
	signSvc   *signing.Service
}

// NewTSSServer creates a new TSS server instance
func NewTSSServer(nodeID string) *TSSServer {
	return &TSSServer{
		nodeID:  nodeID,
		dkgSvc:  dkg.NewService(),
		signSvc: signing.NewService(),
	}
}

// GenerateKey performs distributed key generation
func (s *TSSServer) GenerateKey(ctx context.Context, req *pb.KeyGenRequest) (*pb.KeyGenResponse, error) {
	log.Printf("GenerateKey called for party %s (threshold: %d, total: %d)", 
		req.PartyId, req.Threshold, req.TotalParties)

	// Validate request
	if req.Threshold <= 0 || req.TotalParties <= 0 {
		return nil, status.Errorf(codes.InvalidArgument, "invalid threshold or total parties")
	}
	if req.Threshold > req.TotalParties {
		return nil, status.Errorf(codes.InvalidArgument, "threshold cannot exceed total parties")
	}
	if len(req.PeerIds)+1 < int(req.TotalParties) {
		return nil, status.Errorf(codes.InvalidArgument, "insufficient peers provided")
	}

	// Perform DKG
	result, err := s.dkgSvc.GenerateKey(ctx, &dkg.KeyGenInput{
		PartyID:     req.PartyId,
		Threshold:   int(req.Threshold),
		TotalParties: int(req.TotalParties),
		PeerIDs:     req.PeerIds,
		Seed:        req.Seed,
	})
	if err != nil {
		log.Printf("DKG failed: %v", err)
		return &pb.KeyGenResponse{
			Success: false,
			Error:   err.Error(),
		}, nil
	}

	return &pb.KeyGenResponse{
		Success:    true,
		KeyShare:   result.KeyShare,
		PublicKey:  result.PublicKey,
		ShareID:    result.ShareID,
	}, nil
}

// Sign creates a threshold signature
func (s *TSSServer) Sign(ctx context.Context, req *pb.SignRequest) (*pb.SignResponse, error) {
	log.Printf("Sign called for party %s", req.PartyId)

	// Validate request
	if len(req.MessageHash) == 0 {
		return nil, status.Errorf(codes.InvalidArgument, "message hash is required")
	}
	if len(req.KeyShare) == 0 {
		return nil, status.Errorf(codes.InvalidArgument, "key share is required")
	}

	// Perform signing
	sig, err := s.signSvc.CreateSignature(ctx, &signing.SignInput{
		MessageHash:  req.MessageHash,
		PartyID:      req.PartyId,
		KeyShare:     req.KeyShare,
		PeerIDs:      req.PeerIds,
		Participants: req.Participants,
	})
	if err != nil {
		log.Printf("Signing failed: %v", err)
		return &pb.SignResponse{
			Success: false,
			Error:   err.Error(),
		}, nil
	}

	return &pb.SignResponse{
		Success:    true,
		Signature:  sig.Signature,
		RecoveryId: sig.RecoveryID,
	}, nil
}

// Reshare performs proactive secret sharing
func (s *TSSServer) Reshare(ctx context.Context, req *pb.ReshareRequest) (*pb.ReshareResponse, error) {
	log.Printf("Reshare called for party %s", req.PartyId)

	result, err := s.dkgSvc.Reshare(ctx, &dkg.ReshareInput{
		PartyID:     req.PartyId,
		OldKeyShare: req.OldKeyShare,
		NewThreshold: int(req.NewThreshold),
		NewTotal:    int(req.NewTotal),
		PeerIDs:     req.PeerIds,
	})
	if err != nil {
		return &pb.ReshareResponse{
			Success: false,
			Error:   err.Error(),
		}, nil
	}

	return &pb.ReshareResponse{
		Success:     true,
		NewKeyShare: result.NewKeyShare,
	}, nil
}

// GetPublicKey returns the group public key
func (s *TSSServer) GetPublicKey(ctx context.Context, req *pb.PublicKeyRequest) (*pb.PublicKeyResponse, error) {
	log.Printf("GetPublicKey called for party %s", req.PartyId)

	pubKey, address, err := s.dkgSvc.GetPublicKey(ctx, req.KeyShare)
	if err != nil {
		return &pb.PublicKeyResponse{
			Success: false,
			Error:   err.Error(),
		}, nil
	}

	return &pb.PublicKeyResponse{
		Success:   true,
		PublicKey: pubKey,
		Address:   address,
	}, nil
}

func main() {
	flag.Parse()

	// Use environment variable if flag not set
	if *nodeID == "" {
		*nodeID = os.Getenv("TSS_NODE_ID")
		if *nodeID == "" {
			*nodeID = "node-1"
		}
	}

	addr := fmt.Sprintf("%s:%d", *host, *port)
	lis, err := net.Listen("tcp", addr)
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}

	// Create gRPC server with interceptors
	grpcServer := grpc.NewServer(
		grpc.UnaryInterceptor(loggingInterceptor),
	)

	server := NewTSSServer(*nodeID)
	pb.RegisterTSSServiceServer(grpcServer, server)

	// Handle graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigCh
		log.Println("Shutting down TSS server...")
		grpcServer.GracefulStop()
	}()

	log.Printf("TSS Server [%s] listening on %s", *nodeID, addr)
	log.Printf("Using threshold signature scheme (tss-lib)")
	
	if err := grpcServer.Serve(lis); err != nil {
		log.Fatalf("Failed to serve: %v", err)
	}
}

// loggingInterceptor logs all gRPC requests
func loggingInterceptor(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
	log.Printf("gRPC call: %s", info.FullMethod)
	resp, err := handler(ctx, req)
	if err != nil {
		log.Printf("gRPC error: %v", err)
	}
	return resp, err
}
