// Package dkg implements distributed key generation using tss-lib
package dkg

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/sha256"
	"fmt"
	"sync"
	"time"

	"github.com/bnb-chain/tss-lib/ecdsa/keygen"
	"github.com/bnb-chain/tss-lib/tss"
	"github.com/ethereum/go-ethereum/crypto"
)

// Service handles distributed key generation
type Service struct {
	mu       sync.RWMutex
	sessions map[string]*keygenSession
}

// KeyGenInput contains parameters for key generation
type KeyGenInput struct {
	PartyID      string
	Threshold    int
	TotalParties int
	PeerIDs      []string
	Seed         []byte
}

// KeyGenResult contains the output of key generation
type KeyGenResult struct {
	KeyShare  []byte
	PublicKey []byte
	ShareID   string
}

// ReshareInput contains parameters for resharing
type ReshareInput struct {
	PartyID     string
	OldKeyShare []byte
	NewThreshold int
	NewTotal    int
	PeerIDs     []string
}

// ReshareResult contains the output of resharing
type ReshareResult struct {
	NewKeyShare []byte
}

type keygenSession struct {
	partyID    string
	params     *tss.Parameters
	party      *keygen.LocalParty
	outCh      chan tss.Message
	endCh      chan keygen.LocalPartySaveData
	done       bool
	mu         sync.Mutex
}

// NewService creates a new DKG service
func NewService() *Service {
	return &Service{
		sessions: make(map[string]*keygenSession),
	}
}

// GenerateKey performs distributed key generation
func (s *Service) GenerateKey(ctx context.Context, input *KeyGenInput) (*KeyGenResult, error) {
	// Create party IDs
	partyIDs := make(tss.UnSortedPartyIDs, 0, input.TotalParties)
	
	// Add this party
	thisParty := tss.NewPartyID(input.PartyID, input.PartyID, 1)
	partyIDs = append(partyIDs, thisParty)
	
	// Add peer parties
	for i, peerID := range input.PeerIDs {
		peer := tss.NewPartyID(peerID, peerID, uint16(i+2))
		partyIDs = append(partyIDs, peer)
	}

	// Sort party IDs
	sortedPartyIDs, err := tss.SortPartyIDs(partyIDs)
	if err != nil {
		return nil, fmt.Errorf("failed to sort party IDs: %w", err)
	}

	// Create parameters
	ctx_tss := tss.NewPeerContext(sortedPartyIDs)
	params := tss.NewParameters(ctx_tss, thisParty, input.TotalParties, input.Threshold)

	// Create channels
	outCh := make(chan tss.Message, input.TotalParties*10)
	endCh := make(chan keygen.LocalPartySaveData, 1)

	// Create local party
	party := keygen.NewLocalParty(params, outCh, endCh, input.Seed)

	// Store session
	session := &keygenSession{
		partyID: input.PartyID,
		params:  params,
		party:   party.(*keygen.LocalParty),
		outCh:   outCh,
		endCh:   endCh,
	}

	s.mu.Lock()
	s.sessions[input.PartyID] = session
	s.mu.Unlock()

	// Start party
	go func() {
		if err := party.Start(); err != nil {
			fmt.Printf("Keygen party error: %v\n", err)
		}
	}()

	// Handle messages (simplified - in production, use proper P2P network)
	go s.handleMessages(ctx, session)

	// Wait for result with timeout
	select {
	case result := <-endCh:
		session.mu.Lock()
		session.done = true
		session.mu.Unlock()

		// Serialize key share
		keyShare, err := serializeKeyShare(&result)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize key share: %w", err)
		}

		// Extract public key
		publicKey := result.ECDSAPub.X().Bytes()
		if len(publicKey) < 32 {
			// Pad with leading zeros
			publicKey = append(make([]byte, 32-len(publicKey)), publicKey...)
		}

		return &KeyGenResult{
			KeyShare:  keyShare,
			PublicKey: publicKey,
			ShareID:   thisParty.Id,
		}, nil

	case <-ctx.Done():
		return nil, ctx.Err()
	case <-time.After(5 * time.Minute):
		return nil, fmt.Errorf("key generation timeout")
	}
}

// Reshare performs proactive secret sharing
func (s *Service) Reshare(ctx context.Context, input *ReshareInput) (*ReshareResult, error) {
	// TODO: Implement resharing
	return nil, fmt.Errorf("resharing not yet implemented")
}

// GetPublicKey extracts the public key from a key share
func (s *Service) GetPublicKey(ctx context.Context, keyShare []byte) ([]byte, []byte, error) {
	// Deserialize key share
	share, err := deserializeKeyShare(keyShare)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to deserialize key share: %w", err)
	}

	// Extract public key
	pubKeyX := share.ECDSAPub.X()
	pubKeyY := share.ECDSAPub.Y()

	// Create ECDSA public key
	pubKey := &ecdsa.PublicKey{
		Curve: elliptic.P256(),
		X:     pubKeyX,
		Y:     pubKeyY,
	}

	// Serialize public key
	pubKeyBytes := elliptic.Marshal(pubKey.Curve, pubKey.X, pubKey.Y)

	// Calculate Ethereum address
	address := crypto.PubkeyToAddress(*pubKey).Bytes()

	return pubKeyBytes, address, nil
}

// handleMessages processes outgoing messages
func (s *Service) handleMessages(ctx context.Context, session *keygenSession) {
	for {
		select {
		case msg := <-session.outCh:
			if msg == nil {
				return
			}
			
			// In production: send to peers via P2P network
			// For now, just log
			fmt.Printf("Message to %s (round: %s)\n", 
				msg.GetTo().String(), msg.Type())

		case <-ctx.Done():
			return
		}
	}
}

// serializeKeyShare serializes the key share to bytes
func serializeKeyShare(data *keygen.LocalPartySaveData) ([]byte, error) {
	// Simple serialization - in production, use proper encryption
	// and secure storage
	return data.ShareID.Bytes(), nil
}

// deserializeKeyShare deserializes key share from bytes
func deserializeKeyShare(data []byte) (*keygen.LocalPartySaveData, error) {
	// Simple deserialization - in production, use proper decryption
	return &keygen.LocalPartySaveData{}, nil
}

// Helper functions
func hashMessage(msg []byte) []byte {
	hash := sha256.Sum256(msg)
	return hash[:]
}
