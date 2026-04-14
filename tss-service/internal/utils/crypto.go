// Package utils provides cryptographic utilities
package utils

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"

	"github.com/ethereum/go-ethereum/crypto"
)

// EncryptKeyShare encrypts a key share with a password
func EncryptKeyShare(keyShare []byte, password string) ([]byte, []byte, error) {
	// Derive key from password
	salt := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return nil, nil, err
	}

	key := deriveKey(password, salt)

	// Encrypt
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, nil, err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, nil, err
	}

	ciphertext := gcm.Seal(nonce, nonce, keyShare, nil)
	return ciphertext, salt, nil
}

// DecryptKeyShare decrypts a key share with a password
func DecryptKeyShare(ciphertext []byte, password string, salt []byte) ([]byte, error) {
	key := deriveKey(password, salt)

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, fmt.Errorf("ciphertext too short")
	}

	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	return gcm.Open(nil, nonce, ciphertext, nil)
}

// deriveKey derives a key from password and salt using PBKDF2-like approach
func deriveKey(password string, salt []byte) []byte {
	// Simple key derivation - in production, use scrypt or Argon2
	hash := sha256.Sum256(append([]byte(password), salt...))
	return hash[:]
}

// GenerateRandomBytes generates random bytes
func GenerateRandomBytes(n int) ([]byte, error) {
	b := make([]byte, n)
	_, err := rand.Read(b)
	if err != nil {
		return nil, err
	}
	return b, nil
}

// PublicKeyToAddress converts a public key to Ethereum address
func PublicKeyToAddress(pubKey *ecdsa.PublicKey) string {
	address := crypto.PubkeyToAddress(*pubKey)
	return address.Hex()
}

// CompressPublicKey compresses a public key
func CompressPublicKey(pubKey *ecdsa.PublicKey) []byte {
	return elliptic.MarshalCompressed(pubKey.Curve, pubKey.X, pubKey.Y)
}

// DecompressPublicKey decompresses a public key
func DecompressPublicKey(data []byte) (*ecdsa.PublicKey, error) {
	x, y := elliptic.UnmarshalCompressed(elliptic.P256(), data)
	if x == nil {
		return nil, fmt.Errorf("invalid compressed public key")
	}
	return &ecdsa.PublicKey{
		Curve: elliptic.P256(),
		X:     x,
		Y:     y,
	}, nil
}

// HexToBytes converts hex string to bytes
func HexToBytes(s string) ([]byte, error) {
	if len(s) >= 2 && s[:2] == "0x" {
		s = s[2:]
	}
	return hex.DecodeString(s)
}

// BytesToHex converts bytes to hex string
func BytesToHex(b []byte) string {
	return "0x" + hex.EncodeToString(b)
}

// SecureZero clears sensitive data from memory
func SecureZero(b []byte) {
	for i := range b {
		b[i] = 0
	}
}

// ValidateEthereumAddress validates an Ethereum address
func ValidateEthereumAddress(address string) bool {
	if len(address) != 42 {
		return false
	}
	if address[:2] != "0x" {
		return false
	}
	_, err := hex.DecodeString(address[2:])
	return err == nil
}
