package release

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestVerifyChecksArtifactHashAndManifestSignature(t *testing.T) {
	root := t.TempDir()
	artifactName := "ytk-memory_0.1.0_linux_amd64.tar.gz"
	artifact := filepath.Join(root, artifactName)
	if err := os.WriteFile(artifact, []byte("deterministic artifact"), 0644); err != nil {
		t.Fatal(err)
	}
	hash, err := fileSHA256(artifact)
	if err != nil {
		t.Fatal(err)
	}
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	manifest := Manifest{Artifact: artifactName, Version: "0.1.0", GOOS: "linux", GOARCH: "amd64", Format: "tar.gz", SHA256: hash, SchemaVersion: SchemaVersion, ProtocolVersion: ProtocolVersion, PublicKey: hex.EncodeToString(public)}
	unsigned, _ := json.MarshalIndent(manifest, "", "  ")
	unsigned = append(unsigned, '\n')
	signature := ed25519.Sign(private, unsigned)
	manifest.Signature = hex.EncodeToString(signature)
	manifestBytes, _ := json.MarshalIndent(manifest, "", "  ")
	manifestBytes = append(manifestBytes, '\n')
	manifestPath := filepath.Join(root, "manifest.json")
	signaturePath := filepath.Join(root, "manifest.sig")
	publicPath := filepath.Join(root, "manifest.pub")
	if err := os.WriteFile(manifestPath, manifestBytes, 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(signaturePath, []byte(hex.EncodeToString(signature)), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(publicPath, []byte(hex.EncodeToString(public)), 0644); err != nil {
		t.Fatal(err)
	}
	got, err := Verify(artifact, manifestPath, signaturePath, publicPath)
	if err != nil {
		t.Fatal(err)
	}
	if got.Version != "0.1.0" {
		t.Fatalf("version = %s", got.Version)
	}
	if err := os.WriteFile(artifact, []byte("tampered artifact"), 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := Verify(artifact, manifestPath, signaturePath, publicPath); err == nil {
		t.Fatal("Verify accepted a tampered artifact")
	}
}

func TestSigningKeyRequiresPersistentKeyUnlessEphemeral(t *testing.T) {
	if _, _, err := signingKey("", false); err == nil {
		t.Fatal("signingKey accepted an absent persistent key")
	}
	key, ephemeral, err := signingKey("", true)
	if err != nil || !ephemeral || len(key) != ed25519.PrivateKeySize {
		t.Fatalf("unexpected ephemeral key: len=%d ephemeral=%v err=%v", len(key), ephemeral, err)
	}
}
