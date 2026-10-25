package release

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
)

const SchemaVersion = "1"
const ProtocolVersion = "1"

type Manifest struct {
	Artifact        string `json:"artifact"`
	Version         string `json:"version"`
	GOOS            string `json:"goos"`
	GOARCH          string `json:"goarch"`
	Format          string `json:"format"`
	SHA256          string `json:"sha256"`
	SchemaVersion   string `json:"schemaVersion"`
	ProtocolVersion string `json:"protocolVersion"`
	PublicKey       string `json:"publicKey"`
	Signature       string `json:"signature"`
	Ephemeral       bool   `json:"ephemeralSignature"`
}

type PackageInput struct {
	ModuleDir  string
	OutputDir  string
	Version    string
	GOOS       string
	GOARCH     string
	PrivateKey string
	Ephemeral  bool
}

type PackageResult struct {
	Artifact  string   `json:"artifact"`
	Manifest  string   `json:"manifest"`
	Signature string   `json:"signature"`
	PublicKey string   `json:"publicKey"`
	Checksum  string   `json:"checksum"`
	Metadata  Manifest `json:"metadata"`
}

var versionPattern = regexp.MustCompile(`^v?[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$`)

func Package(input PackageInput) (PackageResult, error) {
	if !versionPattern.MatchString(strings.TrimSpace(input.Version)) {
		return PackageResult{}, errors.New("version must use semantic version form, for example 0.1.0")
	}
	version := strings.TrimPrefix(strings.TrimSpace(input.Version), "v")
	moduleDir, err := findModuleDir(input.ModuleDir)
	if err != nil {
		return PackageResult{}, err
	}
	outputDir, err := filepath.Abs(input.OutputDir)
	if err != nil {
		return PackageResult{}, err
	}
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return PackageResult{}, err
	}
	goos, goarch := input.GOOS, input.GOARCH
	if goos == "" {
		goos = runtime.GOOS
	}
	if goarch == "" {
		goarch = runtime.GOARCH
	}
	if !validPlatform(goos, goarch) {
		return PackageResult{}, fmt.Errorf("unsupported release target %s/%s", goos, goarch)
	}
	key, ephemeral, err := signingKey(input.PrivateKey, input.Ephemeral)
	if err != nil {
		return PackageResult{}, err
	}
	work, err := os.MkdirTemp("", "ytk-memory-release-")
	if err != nil {
		return PackageResult{}, err
	}
	defer os.RemoveAll(work)
	ext := ""
	if goos == "windows" {
		ext = ".exe"
	}
	binary := filepath.Join(work, "ytk-memory"+ext)
	cmd := exec.Command("go", "build", "-trimpath", "-ldflags", "-buildid= -X main.version="+version, "-o", binary, "./cmd/ytk-memory")
	cmd.Dir = moduleDir
	cmd.Env = append(os.Environ(), "GOOS="+goos, "GOARCH="+goarch, "CGO_ENABLED=0")
	if output, err := cmd.CombinedOutput(); err != nil {
		return PackageResult{}, fmt.Errorf("go build %s/%s: %w: %s", goos, goarch, err, strings.TrimSpace(string(output)))
	}
	format, artifactName := "tar.gz", fmt.Sprintf("ytk-memory_%s_%s_%s.tar.gz", version, goos, goarch)
	if goos == "windows" {
		format, artifactName = "zip", fmt.Sprintf("ytk-memory_%s_%s_%s.zip", version, goos, goarch)
	}
	artifact := filepath.Join(outputDir, artifactName)
	if err := archive(binary, artifact, format); err != nil {
		return PackageResult{}, err
	}
	hash, err := fileSHA256(artifact)
	if err != nil {
		return PackageResult{}, err
	}
	manifest := Manifest{Artifact: artifactName, Version: version, GOOS: goos, GOARCH: goarch, Format: format, SHA256: hash, SchemaVersion: SchemaVersion, ProtocolVersion: ProtocolVersion, PublicKey: hex.EncodeToString(key.Public().(ed25519.PublicKey)), Ephemeral: ephemeral}
	manifestBytes, _ := json.MarshalIndent(manifest, "", "  ")
	manifestBytes = append(manifestBytes, '\n')
	signature := ed25519.Sign(key, manifestBytes)
	manifest.Signature = hex.EncodeToString(signature)
	manifestBytes, _ = json.MarshalIndent(manifest, "", "  ")
	manifestBytes = append(manifestBytes, '\n')
	manifestPath := filepath.Join(outputDir, artifactName+".manifest.json")
	signaturePath := filepath.Join(outputDir, artifactName+".sig")
	publicPath := filepath.Join(outputDir, artifactName+".pub")
	checksumPath := filepath.Join(outputDir, artifactName+".sha256")
	if err := os.WriteFile(manifestPath, manifestBytes, 0644); err != nil {
		return PackageResult{}, err
	}
	if err := os.WriteFile(signaturePath, []byte(hex.EncodeToString(signature)+"\n"), 0644); err != nil {
		return PackageResult{}, err
	}
	if err := os.WriteFile(publicPath, []byte(manifest.PublicKey+"\n"), 0644); err != nil {
		return PackageResult{}, err
	}
	if err := os.WriteFile(checksumPath, []byte(hash+"  "+artifactName+"\n"), 0644); err != nil {
		return PackageResult{}, err
	}
	return PackageResult{Artifact: artifact, Manifest: manifestPath, Signature: signaturePath, PublicKey: publicPath, Checksum: checksumPath, Metadata: manifest}, nil
}

func Verify(artifactPath, manifestPath, signaturePath, publicKeyPath string) (Manifest, error) {
	manifestBytes, err := os.ReadFile(manifestPath)
	if err != nil {
		return Manifest{}, err
	}
	var manifest Manifest
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		return Manifest{}, fmt.Errorf("invalid manifest: %w", err)
	}
	if filepath.Base(artifactPath) != manifest.Artifact {
		return Manifest{}, errors.New("artifact name does not match manifest")
	}
	hash, err := fileSHA256(artifactPath)
	if err != nil {
		return Manifest{}, err
	}
	if !strings.EqualFold(hash, manifest.SHA256) {
		return Manifest{}, errors.New("artifact SHA-256 does not match manifest")
	}
	publicBytes, err := os.ReadFile(publicKeyPath)
	if err != nil {
		return Manifest{}, err
	}
	public, err := hex.DecodeString(strings.TrimSpace(string(publicBytes)))
	if err != nil || len(public) != ed25519.PublicKeySize {
		return Manifest{}, errors.New("public key must be 32-byte hex")
	}
	signatureBytes, err := os.ReadFile(signaturePath)
	if err != nil {
		return Manifest{}, err
	}
	signature, err := hex.DecodeString(strings.TrimSpace(string(signatureBytes)))
	if err != nil || len(signature) != ed25519.SignatureSize {
		return Manifest{}, errors.New("signature must be 64-byte hex")
	}
	if !strings.EqualFold(manifest.Signature, hex.EncodeToString(signature)) {
		return Manifest{}, errors.New("manifest signature does not match signature file")
	}
	if manifest.SchemaVersion != SchemaVersion || manifest.ProtocolVersion != ProtocolVersion {
		return Manifest{}, errors.New("manifest schema or protocol version is unsupported")
	}
	unsigned := manifest
	unsigned.Signature = ""
	unsignedBytes, _ := json.MarshalIndent(unsigned, "", "  ")
	unsignedBytes = append(unsignedBytes, '\n')
	if !ed25519.Verify(ed25519.PublicKey(public), unsignedBytes, signature) {
		return Manifest{}, errors.New("manifest signature verification failed")
	}
	if manifest.PublicKey != hex.EncodeToString(public) {
		return Manifest{}, errors.New("manifest public key does not match verifier key")
	}
	return manifest, nil
}

func signingKey(value string, ephemeral bool) (ed25519.PrivateKey, bool, error) {
	if value == "" {
		value = os.Getenv("YTK_MEMORY_SIGNING_PRIVATE_KEY")
	}
	if value != "" {
		decoded, err := hex.DecodeString(strings.TrimSpace(value))
		if err != nil || len(decoded) != ed25519.PrivateKeySize {
			return nil, false, errors.New("YTK_MEMORY_SIGNING_PRIVATE_KEY must be 64-byte hex")
		}
		return ed25519.PrivateKey(decoded), false, nil
	}
	if !ephemeral {
		return nil, false, errors.New("a persistent signing key is required; set YTK_MEMORY_SIGNING_PRIVATE_KEY or pass --ephemeral-key for a non-release build")
	}
	_, private, err := ed25519.GenerateKey(rand.Reader)
	return private, true, err
}

func findModuleDir(value string) (string, error) {
	if value == "" {
		value, _ = os.Getwd()
	}
	value, err := filepath.Abs(value)
	if err != nil {
		return "", err
	}
	for {
		if _, err := os.Stat(filepath.Join(value, "go.mod")); err == nil {
			return value, nil
		}
		parent := filepath.Dir(value)
		if parent == value {
			break
		}
		value = parent
	}
	return "", errors.New("could not locate native/ytk-memory go.mod")
}

func validPlatform(goos, goarch string) bool {
	return (goos == "windows" || goos == "linux" || goos == "darwin") && (goarch == "amd64" || goarch == "arm64")
}

func archive(binary, destination, format string) error {
	if format == "zip" {
		out, err := os.Create(destination)
		if err != nil {
			return err
		}
		defer out.Close()
		zw := zip.NewWriter(out)
		defer zw.Close()
		info, err := os.Stat(binary)
		if err != nil {
			return err
		}
		header, err := zip.FileInfoHeader(info)
		if err != nil {
			return err
		}
		header.Name = filepath.Base(binary)
		header.Method = zip.Deflate
		header.SetModTime(time.Unix(0, 0))
		writer, err := zw.CreateHeader(header)
		if err != nil {
			return err
		}
		source, err := os.Open(binary)
		if err != nil {
			return err
		}
		defer source.Close()
		_, err = io.Copy(writer, source)
		return err
	}
	out, err := os.Create(destination)
	if err != nil {
		return err
	}
	defer out.Close()
	gz := gzip.NewWriter(out)
	gz.ModTime = time.Unix(0, 0)
	gz.Name = ""
	tw := tar.NewWriter(gz)
	defer tw.Close()
	info, err := os.Stat(binary)
	if err != nil {
		return err
	}
	header, err := tar.FileInfoHeader(info, "")
	if err != nil {
		return err
	}
	header.Name = filepath.Base(binary)
	header.ModTime = time.Unix(0, 0)
	if err := tw.WriteHeader(header); err != nil {
		return err
	}
	source, err := os.Open(binary)
	if err != nil {
		return err
	}
	defer source.Close()
	_, err = io.Copy(tw, source)
	return err
}

func fileSHA256(filename string) (string, error) {
	file, err := os.Open(filename)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}
