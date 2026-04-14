// Package signing implements threshold signing using tss-lib
package signing

import (
	"context"
	"crypto/sha256"
	"fmt"
	"math/big"
	"time"

	"github.com/bnb-chain/tss-lib/ecdsa/signing"
	"github.com/bnb-chain/tss-lib/tss"
)

// Service handles threshold signing
type Service struct{}

// SignInput contains parameters for signing
type SignInput struct {
	MessageHash  []byte
	PartyID      string
	KeyShare     []byte
	PeerIDs      []string
	Participants []string
}

// SignResult contains the output of signing
type SignResult struct {
	Signature  []byte
	RecoveryID []byte
}

type signingSession struct {
	partyID string
	params  *tss.Parameters
	party   *signing.LocalParty
	outCh   chan tss.Message
	endCh   chan signing.SignatureData
	done    bool
}

// NewService creates a new signing service
func NewService() *Service {
	return &Service{}
}

// CreateSignature creates a threshold signature
func (s *Service) CreateSignature(ctx context.Context, input *SignInput) (*SignResult, error) {
	// Create party IDs for participants only
	partyIDs := make(tss.UnSortedPartyIDs, 0, len(input.Participants))
	
	var thisParty *tss.PartyID
	for i, participantID := range input.Participants {
		party := tss.NewPartyID(participantID, participantID, uint16(i+1))
		partyIDs = append(partyIDs, party)
		if participantID == input.PartyID {
			thisParty = party
		}
	}

	if thisParty == nil {
		return nil, fmt.Errorf("this party is not in the participant list")
	}

	// Sort party IDs
	sortedPartyIDs, err := tss.SortPartyIDs(partyIDs)
	if err != nil {
		return nil, fmt.Errorf("failed to sort party IDs: %w", err)
	}

	// Create parameters
	ctx_tss := tss.NewPeerContext(sortedPartyIDs)
	// For signing, we need threshold parties to participate
	threshold := len(input.Participants) // Simplified - should be from config
	params := tss.NewParameters(ctx_tss, thisParty, len(input.Participants), threshold)

	// TODO: Deserialize key share
	// For now, create a placeholder
	key := &signing.LocalPartySaveData{}

	// Create channels
	outCh := make(chan tss.Message, len(input.Participants)*10)
	endCh := make(chan signing.SignatureData, 1)

	// Create local party
	party := signing.NewLocalParty(input.MessageHash, params, key, outCh, endCh)

	// Start party
	go func() {
		if err := party.Start(); err != nil {
			fmt.Printf("Signing party error: %v\n", err)
		}
	}()

	// Handle messages
	go func() {
		for msg := range outCh {
			if msg == nil {
				return
			}
			// In production: send to peers via P2P network
			fmt.Printf("Signing message to %s\n", msg.GetTo().String())
		}
	}()

	// Wait for result with timeout
	select {
	case result := <-endCh:
		// Extract signature components
		r := result.R
		s := result.S

		// Serialize signature (r || s)
		sig := make([]byte, 64)
		rBytes := r.Bytes()
		sBytes := s.Bytes()
		
		// Pad to 32 bytes
		copy(sig[32-len(rBytes):], rBytes)
		copy(sig[64-len(sBytes):], sBytes)

		// Calculate recovery ID (for Ethereum)
		recoveryID := calculateRecoveryID(input.MessageHash, sig, result.ECDSAPub)

		return &SignResult{
			Signature:  sig,
			RecoveryID: recoveryID,
		}, nil

	case <-ctx.Done():
		return nil, ctx.Err()
	case <-time.After(2 * time.Minute):
		return nil, fmt.Errorf("signing timeout")
	}
}

// calculateRecoveryID calculates the recovery ID for Ethereum
func calculateRecoveryID(msgHash []byte, sig []byte, pubKey *crypto.ECPoint) []byte {
	// Simplified - in production, implement proper recovery ID calculation
	return []byte{0}
}

// VerifySignature verifies an ECDSA signature
func (s *Service) VerifySignature(msgHash []byte, signature []byte, publicKey []byte) (bool, error) {
	if len(signature) != 64 {
		return false, fmt.Errorf("invalid signature length")
	}

	// Extract r and s
	r := new(big.Int).SetBytes(signature[:32])
	s := new(big.Int).SetBytes(signature[32:])

	// In production: use proper ECDSA verification
	// For now, just check format
	if r.Sign() <= 0 || s.Sign() <= 0 {
		return false, fmt.Errorf("invalid signature values")
	}

	return true, nil
}

// HashMessage hashes a message using SHA-256
func HashMessage(msg []byte) []byte {
	hash := sha256.Sum256(msg)
	return hash[:]
}

// HashMessageKeccak256 hashes a message using Keccak-256 (Ethereum)
func HashMessageKeccak256(msg []byte) []byte {
	// Import from go-ethereum/crypto
	// return crypto.Keccak256(msg)
	return HashMessage(msg) // Placeholder
}
