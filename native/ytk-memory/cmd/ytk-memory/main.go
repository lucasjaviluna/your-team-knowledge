package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"

	"github.com/corporate-knowledge/ytk-memory/internal/core"
	"github.com/corporate-knowledge/ytk-memory/internal/release"
	"github.com/corporate-knowledge/ytk-memory/internal/setup"
	"github.com/corporate-knowledge/ytk-memory/internal/surface"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

var version = "dev"

type configFile struct {
	ProjectSlug string `json:"project_slug"`
	ProjectID   string `json:"projectId"`
	Database    string `json:"database"`
	Area        string `json:"default_area"`
}
type config struct{ project, database, area, root string }

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
func run(args []string) error {
	if len(args) == 0 {
		return errors.New("usage: ytk-memory <mcp|setup|uninstall|conformance|evaluate|release|doctor|backup|upgrade|rollback> [options]")
	}
	if args[0] == "--version" || args[0] == "version" {
		fmt.Println(version)
		return nil
	}
	command := args[0]
	if command == "conformance" {
		fixture, database, err := conformanceArguments(args[1:])
		if err != nil {
			return err
		}
		report, err := core.RunConformance(fixture, database)
		if err != nil {
			return err
		}
		return json.NewEncoder(os.Stdout).Encode(report)
	}
	if command == "evaluate" {
		fixture, database, err := evaluationArguments(args[1:])
		if err != nil {
			return err
		}
		report, err := core.RunEvaluation(fixture, database)
		if err != nil {
			return err
		}
		return json.NewEncoder(os.Stdout).Encode(report)
	}
	if command == "release" {
		return runRelease(args[1:])
	}
	if command == "setup" || command == "uninstall" {
		return runSetup(command, args[1:])
	}
	fs := flag.NewFlagSet(command, flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	project := fs.String("project", "", "project id")
	database := fs.String("database", "", "SQLite path")
	area := fs.String("area", "", "memory area")
	host := fs.String("host", "codex", "consumer host for doctor: codex, claude, pi, or opencode")
	to := fs.String("to", "", "backup target")
	backupTo := fs.String("backup-to", "", "upgrade backup target")
	from := fs.String("from", "", "rollback source")
	currentTo := fs.String("backup-current-to", "", "rollback safety backup")
	confirm := fs.Bool("confirm", false, "confirm rollback")
	overwrite := fs.Bool("overwrite", false, "replace existing backup")
	jsonOutput := fs.Bool("json", false, "print machine-readable JSON")
	if err := fs.Parse(args[1:]); err != nil {
		return err
	}
	if fs.NArg() != 0 {
		return fmt.Errorf("unexpected argument: %s", fs.Arg(0))
	}
	requireLocalConfig := command == "mcp"
	cfg, err := resolve(*project, *database, *area, requireLocalConfig)
	if err != nil {
		return err
	}
	if command == "mcp" {
		store, err := core.Open(cfg.database, nil)
		if err != nil {
			return err
		}
		defer store.Close()
		return surface.NewService(store, surface.Config{ProjectID: cfg.project, Area: cfg.area}).Server().Run(context.Background(), &mcp.StdioTransport{})
	}
	if command == "doctor" {
		if *host != "codex" && *host != "claude" && *host != "pi" && *host != "opencode" {
			return errors.New("--host must be codex, claude, pi, or opencode.")
		}
		return doctor(cfg, *jsonOutput, *host)
	}
	if command == "backup" {
		return doBackup(cfg, *to, *overwrite, *jsonOutput)
	}
	if command == "upgrade" {
		return doUpgrade(cfg, *backupTo, *overwrite, *jsonOutput)
	}
	if command == "rollback" {
		return doRollback(cfg, *from, *currentTo, *confirm, *jsonOutput)
	}
	return fmt.Errorf("unknown operation: %s", command)
}

func runRelease(args []string) error {
	if len(args) == 0 {
		return errors.New("usage: ytk-memory release <package|verify> [options]")
	}
	switch args[0] {
	case "package":
		fs := flag.NewFlagSet("release package", flag.ContinueOnError)
		fs.SetOutput(os.Stderr)
		output := fs.String("output", "dist", "release output directory")
		versionValue := fs.String("version", version, "semantic release version")
		goos := fs.String("goos", runtime.GOOS, "target operating system")
		goarch := fs.String("goarch", runtime.GOARCH, "target architecture")
		moduleDir := fs.String("module-dir", "", "native Go module directory")
		ephemeral := fs.Bool("ephemeral-key", false, "generate a temporary key (never use for an approved release)")
		jsonOutput := fs.Bool("json", false, "print machine-readable JSON")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		if fs.NArg() != 0 {
			return fmt.Errorf("unexpected argument: %s", fs.Arg(0))
		}
		result, err := release.Package(release.PackageInput{ModuleDir: *moduleDir, OutputDir: *output, Version: *versionValue, GOOS: *goos, GOARCH: *goarch, Ephemeral: *ephemeral})
		if err != nil {
			return err
		}
		if *jsonOutput {
			return json.NewEncoder(os.Stdout).Encode(result)
		}
		fmt.Fprintf(os.Stdout, "Release empaquetado: %s\nManifiesto: %s\nFirma: %s\nClave pública: %s\nChecksum: %s\n", result.Artifact, result.Manifest, result.Signature, result.PublicKey, result.Checksum)
		return nil
	case "verify":
		fs := flag.NewFlagSet("release verify", flag.ContinueOnError)
		fs.SetOutput(os.Stderr)
		artifact := fs.String("artifact", "", "release archive")
		manifest := fs.String("manifest", "", "release manifest")
		signature := fs.String("signature", "", "manifest signature")
		publicKey := fs.String("public-key", "", "trusted public key")
		jsonOutput := fs.Bool("json", false, "print machine-readable JSON")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		if fs.NArg() != 0 {
			return fmt.Errorf("unexpected argument: %s", fs.Arg(0))
		}
		if *artifact == "" || *manifest == "" || *signature == "" || *publicKey == "" {
			return errors.New("--artifact, --manifest, --signature and --public-key are required")
		}
		metadata, err := release.Verify(*artifact, *manifest, *signature, *publicKey)
		if err != nil {
			return err
		}
		if *jsonOutput {
			return json.NewEncoder(os.Stdout).Encode(map[string]any{"verified": true, "manifest": metadata})
		}
		fmt.Fprintf(os.Stdout, "Release verificado: %s (%s/%s)\n", metadata.Artifact, metadata.GOOS, metadata.GOARCH)
		return nil
	default:
		return fmt.Errorf("unknown release operation: %s", args[0])
	}
}

func runSetup(command string, args []string) error {
	if len(args) == 0 || (args[0] != "codex" && args[0] != "claude" && args[0] != "pi" && args[0] != "opencode") {
		return errors.New("usage: ytk-memory setup <codex|claude|pi|opencode> [--dry-run] [--portable]")
	}
	host := args[0]
	fs := flag.NewFlagSet(command, flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	project := fs.String("project", "", "project id")
	database := fs.String("database", "", "SQLite path")
	area := fs.String("area", "", "memory area")
	dryRun := fs.Bool("dry-run", false, "preview changes")
	jsonOutput := fs.Bool("json", false, "print machine-readable JSON")
	portable := fs.Bool("portable", false, "write generic MCP manifest")
	remove := fs.Bool("uninstall", false, "remove setup owned by Codex")
	removeGlobalMCP := fs.Bool("remove-global-mcp", false, "also remove the global Codex MCP registration")
	if err := fs.Parse(args[1:]); err != nil {
		return err
	}
	if fs.NArg() != 0 {
		return fmt.Errorf("unexpected argument: %s", fs.Arg(0))
	}
	if host != "codex" && (*portable || *removeGlobalMCP) {
		return errors.New("--portable and --remove-global-mcp apply only to the Codex setup.")
	}
	cfg, err := resolve(*project, *database, *area, false)
	if err != nil {
		return err
	}
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}
	executable, err := os.Executable()
	if err != nil {
		return err
	}
	executable, err = filepath.Abs(executable)
	if err != nil {
		return err
	}
	home := ""
	if host == "codex" {
		home, err = codexHome()
		if err != nil {
			return err
		}
	}
	context := setup.Context{Root: cwd, Home: home, Executable: executable, ProjectID: cfg.project, Database: cfg.database, Area: cfg.area}
	var result setup.Result
	if command == "uninstall" || *remove {
		if host == "claude" {
			result, err = setup.UninstallClaude(context, *dryRun)
		} else if host == "pi" {
			result, err = setup.UninstallPi(context, *dryRun)
		} else if host == "opencode" {
			result, err = setup.UninstallOpenCode(context, *dryRun)
		} else {
			removeGlobal := *removeGlobalMCP
			if !removeGlobal && !*dryRun && !*jsonOutput {
				removeGlobal, err = confirmGlobalMCPRemoval()
				if err != nil {
					return err
				}
			}
			result, err = setup.Uninstall(context, *dryRun, removeGlobal)
		}
	} else if *dryRun {
		if host == "claude" {
			result, err = setup.InstallClaude(context, true)
		} else if host == "pi" {
			result, err = setup.InstallPi(context, true)
		} else if host == "opencode" {
			result, err = setup.InstallOpenCode(context, true)
		} else {
			result, err = setup.Install(context, true, *portable)
		}
	} else {
		if host == "claude" {
			_, err = setup.InstallClaude(context, true)
		} else if host == "pi" {
			_, err = setup.InstallPi(context, true)
		} else if host == "opencode" {
			_, err = setup.InstallOpenCode(context, true)
		} else {
			_, err = setup.Install(context, true, *portable)
		}
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(cfg.database), 0755); err != nil {
			return err
		}
		store, openErr := core.Open(cfg.database, nil)
		if openErr != nil {
			return openErr
		}
		if closeErr := store.Close(); closeErr != nil {
			return closeErr
		}
		if host == "claude" {
			result, err = setup.InstallClaude(context, false)
		} else if host == "pi" {
			result, err = setup.InstallPi(context, false)
		} else if host == "opencode" {
			result, err = setup.InstallOpenCode(context, false)
		} else {
			result, err = setup.Install(context, false, *portable)
		}
	}
	if err != nil {
		return err
	}
	if !*jsonOutput {
		return printSetupResult(result)
	}
	return json.NewEncoder(os.Stdout).Encode(result)
}

func codexHome() (string, error) {
	home := os.Getenv("CODEX_HOME")
	if home == "" {
		userHome, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		home = filepath.Join(userHome, ".codex")
	}
	return filepath.Abs(home)
}

func printSetupResult(result setup.Result) error {
	operation := "Instalación"
	if result.Uninstall {
		operation = "Desinstalación"
	}
	mode := "Completada"
	if result.DryRun {
		mode = "Vista previa"
	}
	fmt.Fprintf(os.Stdout, "%s · %s\nProyecto: %s\nCliente: %s\nAlcance de instrucciones: %s\n", operation, mode, result.ProjectID, result.Agent, result.InstructionScope)
	if len(result.Changes) == 0 {
		fmt.Fprintln(os.Stdout, "\nNo se requieren cambios; la configuración ya está al día.")
		return nil
	}
	heading := "Cambios aplicados:"
	if result.DryRun {
		heading = "Archivos que cambiarían:"
	}
	fmt.Fprintf(os.Stdout, "\n%s\n", heading)
	for _, change := range result.Changes {
		action := change.Action
		switch action {
		case "create":
			action = "crear"
		case "update":
			action = "actualizar"
		case "remove":
			action = "eliminar"
		}
		fmt.Fprintf(os.Stdout, "  • %s — %s\n", action, change.File)
	}
	if result.DryRun {
		fmt.Fprintln(os.Stdout, "\nLa vista previa no modificó archivos.")
	}
	return nil
}

func confirmGlobalMCPRemoval() (bool, error) {
	info, err := os.Stdin.Stat()
	if err != nil {
		return false, err
	}
	if info.Mode()&os.ModeCharDevice == 0 {
		return false, nil
	}
	fmt.Fprint(os.Stdout, "El registro MCP global de Codex puede ser usado por otros proyectos. ¿Querés eliminarlo también? [y/N] ")
	answer, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil && len(answer) == 0 {
		return false, err
	}
	switch strings.ToLower(strings.TrimSpace(answer)) {
	case "y", "yes", "s", "si", "sí":
		return true, nil
	default:
		return false, nil
	}
}
func resolve(project, database, area string, requireLocalConfig bool) (config, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return config{}, err
	}
	root := cwd
	var configured configFile
	configuredFile := ""
	for dir := cwd; ; dir = filepath.Dir(dir) {
		p := filepath.Join(dir, ".ytk-memory.json")
		b, e := os.ReadFile(p)
		if e == nil {
			if json.Unmarshal(b, &configured) != nil {
				return config{}, fmt.Errorf("Invalid JSON in %s.", p)
			}
			root = dir
			configuredFile = p
			break
		}
		if dir == filepath.Dir(dir) {
			break
		}
	}
	if requireLocalConfig && configuredFile == "" {
		return config{}, errors.New("Agent Memory is not configured for this project. Run `ytk-memory setup codex` from the project root.")
	}
	if project == "" {
		project = os.Getenv("YTK_MEMORY_PROJECT_ID")
	}
	if project == "" {
		project = configured.ProjectSlug
		if project == "" {
			project = configured.ProjectID
		}
	}
	if project == "" {
		if out, e := exec.Command("git", "config", "--get", "remote.origin.url").Output(); e == nil {
			re := regexp.MustCompile(`(?:[:/])([^/:]+?)(?:\.git)?$`)
			if m := re.FindStringSubmatch(strings.TrimSpace(string(out))); len(m) > 1 {
				project = slug(m[1])
			}
		}
	}
	if project == "" {
		project = slug(filepath.Base(cwd))
	}
	project = strings.TrimSpace(project)
	if database == "" {
		database = os.Getenv("YTK_MEMORY_DATABASE")
	}
	if database == "" {
		database = configured.Database
	}
	if area == "" {
		area = os.Getenv("YTK_MEMORY_AREA")
	}
	if area == "" {
		area = configured.Area
	}
	database, area = strings.TrimSpace(database), strings.TrimSpace(area)
	if database == "" {
		database = ".ytk-memory/ytk-memory.sqlite"
	}
	if !filepath.IsAbs(database) {
		database = filepath.Join(root, database)
	}
	database, _ = filepath.Abs(database)
	if strings.TrimSpace(project) == "" || len(project) > 200 {
		return config{}, errors.New("Resolved project id is invalid.")
	}
	for _, r := range project {
		if r < 0x20 {
			return config{}, errors.New("Resolved project id is invalid.")
		}
	}
	return config{project: project, database: database, area: area, root: root}, nil
}
func slug(s string) string {
	re := regexp.MustCompile(`[^a-zA-Z0-9]+`)
	s = strings.Trim(re.ReplaceAllString(strings.ToLower(strings.TrimSpace(s)), "-"), "-")
	if s == "" {
		return "project"
	}
	return s
}
func doctor(c config, jsonOutput bool, host string) error {
	if _, err := os.Stat(c.database); os.IsNotExist(err) {
		result := map[string]any{"operation": "doctor", "healthy": false, "state": "missing_configuration", "projectId": c.project, "database": c.database, "checks": []map[string]string{{"name": "database", "status": "missing", "message": "No se encontró la base de datos. Ejecutá `ytk-memory setup codex` para crearla o restaurá un backup."}}}
		return printDoctor(result, jsonOutput)
	} else if err != nil {
		result := map[string]any{"operation": "doctor", "healthy": false, "state": "invalid_configuration", "projectId": c.project, "database": c.database, "checks": []map[string]string{{"name": "database", "status": "invalid", "message": "No se pudo acceder a la base de datos: " + err.Error()}}}
		return printDoctor(result, jsonOutput)
	}
	s, err := core.Open(c.database, nil)
	if err != nil {
		result := map[string]any{"operation": "doctor", "healthy": false, "state": "invalid_configuration", "projectId": c.project, "database": c.database, "checks": []map[string]string{{"name": "database", "status": "invalid", "message": "No se pudo abrir la base SQLite: " + err.Error()}}}
		return printDoctor(result, jsonOutput)
	}
	defer s.Close()
	life, err := s.InspectLifecycle(context.Background(), c.project)
	if err != nil {
		result := map[string]any{"operation": "doctor", "healthy": false, "state": "invalid_configuration", "projectId": c.project, "database": c.database, "checks": []map[string]string{{"name": "database", "status": "invalid", "message": "No se pudo leer el esquema SQLite: " + err.Error()}}}
		return printDoctor(result, jsonOutput)
	}
	checks := []map[string]string{{"name": "database", "status": "ok", "message": "SQLite schema is readable."}}
	healthy := true
	if err := s.IntegrityCheck(context.Background()); err != nil {
		checks = append(checks, map[string]string{"name": "integrity", "status": "invalid", "message": err.Error()})
		healthy = false
	} else {
		checks = append(checks, map[string]string{"name": "integrity", "status": "ok", "message": "SQLite quick_check passed."})
	}
	if host == "codex" {
		home, homeErr := codexHome()
		if homeErr == nil {
			setupCheck := inspectCodexSetup(filepath.Join(home, "config.toml"))
			checks = append(checks, setupCheck)
			if setupCheck["status"] != "ok" {
				healthy = false
			}
		}
	} else if host == "claude" {
		setupCheck := inspectClaudeSetup(filepath.Join(c.root, ".mcp.json"))
		checks = append(checks, setupCheck)
		if setupCheck["status"] != "ok" {
			healthy = false
		}
	} else if host == "pi" {
		setupCheck := inspectPiSetup(filepath.Join(c.root, ".pi", "mcp.json"))
		checks = append(checks, setupCheck)
		if setupCheck["status"] != "ok" {
			healthy = false
		}
	} else {
		setupCheck := inspectOpenCodeSetup(setup.OpenCodeConfigPath(c.root), filepath.Join(c.root, ".ytk-memory", "opencode-managed"))
		checks = append(checks, setupCheck)
		if setupCheck["status"] != "ok" {
			healthy = false
		}
	}
	result := map[string]any{"operation": "doctor", "healthy": healthy, "host": host, "projectId": c.project, "database": c.database, "lifecycle": life, "go": runtime.Version(), "checks": checks}
	return printDoctor(result, jsonOutput)
}

func inspectOpenCodeSetup(filename, markerFile string) map[string]string {
	marker, err := os.ReadFile(markerFile)
	if os.IsNotExist(err) {
		return map[string]string{"name": "opencode_mcp", "status": "not_configured", "message": "Run ytk-memory setup opencode to register the project MCP server."}
	}
	if err != nil || string(marker) != "Managed by ytk-memory-init: OpenCode project MCP.\n" {
		return map[string]string{"name": "opencode_mcp", "status": "invalid", "message": "OpenCode ownership marker is missing or invalid."}
	}
	contents, err := os.ReadFile(filename)
	if os.IsNotExist(err) {
		return map[string]string{"name": "opencode_mcp", "status": "invalid", "message": "Managed OpenCode opencode.json is missing."}
	}
	if err != nil {
		return map[string]string{"name": "opencode_mcp", "status": "invalid", "message": err.Error()}
	}
	var document map[string]any
	if err := setup.DecodeOpenCodeConfig(contents, &document); err != nil {
		return map[string]string{"name": "opencode_mcp", "status": "invalid", "message": "OpenCode project config is not valid JSON or JSONC."}
	}
	servers, ok := document["mcp"].(map[string]any)
	if !ok {
		return map[string]string{"name": "opencode_mcp", "status": "not_configured", "message": "No OpenCode MCP server was found."}
	}
	server, ok := servers["ytk-memory"].(map[string]any)
	if !ok || server["type"] != "local" {
		return map[string]string{"name": "opencode_mcp", "status": "invalid", "message": "Managed OpenCode MCP entry is missing or invalid."}
	}
	command, ok := server["command"].([]any)
	if !ok || len(command) != 2 || command[1] != "mcp" {
		return map[string]string{"name": "opencode_mcp", "status": "invalid", "message": "Managed OpenCode MCP command is missing."}
	}
	executable, ok := command[0].(string)
	if !ok || executable == "" {
		return map[string]string{"name": "opencode_mcp", "status": "invalid", "message": "Managed OpenCode executable is missing."}
	}
	if _, err := os.Stat(executable); err != nil {
		return map[string]string{"name": "opencode_mcp", "status": "invalid", "message": "Registered native executable is unavailable."}
	}
	return map[string]string{"name": "opencode_mcp", "status": "ok", "message": "Project-scoped OpenCode MCP server is registered and available."}
}

func inspectClaudeSetup(filename string) map[string]string {
	contents, err := os.ReadFile(filename)
	if os.IsNotExist(err) {
		return map[string]string{"name": "claude_mcp", "status": "not_configured", "message": "Run ytk-memory setup claude to register the project MCP server."}
	}
	if err != nil {
		return map[string]string{"name": "claude_mcp", "status": "invalid", "message": err.Error()}
	}
	var document map[string]any
	if err := json.Unmarshal(contents, &document); err != nil {
		return map[string]string{"name": "claude_mcp", "status": "invalid", "message": "Claude .mcp.json is not valid JSON."}
	}
	servers, ok := document["mcpServers"].(map[string]any)
	if !ok {
		return map[string]string{"name": "claude_mcp", "status": "not_configured", "message": "No Claude Code MCP server was found."}
	}
	server, ok := servers["ytk-memory"].(map[string]any)
	if !ok || server["_managedBy"] != "ytk-memory-init" {
		return map[string]string{"name": "claude_mcp", "status": "not_configured", "message": "No managed Claude Code MCP server was found."}
	}
	command, ok := server["command"].(string)
	if !ok || command == "" {
		return map[string]string{"name": "claude_mcp", "status": "invalid", "message": "Managed Claude Code MCP command is missing."}
	}
	if _, err := os.Stat(command); err != nil {
		return map[string]string{"name": "claude_mcp", "status": "invalid", "message": "Registered native executable is unavailable."}
	}
	return map[string]string{"name": "claude_mcp", "status": "ok", "message": "Project-scoped Claude Code MCP server is registered and available."}
}

func inspectPiSetup(filename string) map[string]string {
	contents, err := os.ReadFile(filename)
	if os.IsNotExist(err) {
		return map[string]string{"name": "pi_mcp", "status": "not_configured", "message": "Run ytk-memory setup pi to register the project MCP server."}
	}
	if err != nil {
		return map[string]string{"name": "pi_mcp", "status": "invalid", "message": err.Error()}
	}
	var document map[string]any
	if err := json.Unmarshal(contents, &document); err != nil {
		return map[string]string{"name": "pi_mcp", "status": "invalid", "message": "Pi .pi/mcp.json is not valid JSON."}
	}
	servers, ok := document["mcpServers"].(map[string]any)
	if !ok {
		return map[string]string{"name": "pi_mcp", "status": "not_configured", "message": "No Pi MCP server was found."}
	}
	server, ok := servers["ytk-memory"].(map[string]any)
	if !ok || server["description"] != "Managed by ytk-memory-init: local Agent Memory for this project." {
		return map[string]string{"name": "pi_mcp", "status": "not_configured", "message": "No managed Pi MCP server was found."}
	}
	command, ok := server["command"].(string)
	if !ok || command == "" {
		return map[string]string{"name": "pi_mcp", "status": "invalid", "message": "Managed Pi MCP command is missing."}
	}
	if _, err := os.Stat(command); err != nil {
		return map[string]string{"name": "pi_mcp", "status": "invalid", "message": "Registered native executable is unavailable."}
	}
	return map[string]string{"name": "pi_mcp", "status": "ok", "message": "Trusted project Pi MCP server is registered and available."}
}

func printDoctor(result map[string]any, jsonOutput bool) error {
	return writeDoctor(os.Stdout, result, jsonOutput)
}

func writeDoctor(output io.Writer, result map[string]any, jsonOutput bool) error {
	if jsonOutput {
		return json.NewEncoder(output).Encode(result)
	}
	healthy := result["healthy"] == true
	title := "Agent Memory · Revisar configuración"
	if healthy {
		title = "Agent Memory · Todo en orden"
	} else if result["state"] == "missing_configuration" {
		title = "Agent Memory · Falta configuración"
	}
	fmt.Fprintln(output, title)
	fmt.Fprintf(output, "Proyecto: %v\nBase de datos: %v\n", result["projectId"], result["database"])
	if value, ok := result["go"]; ok {
		fmt.Fprintf(output, "Go: %v\n", value)
	}
	if checks, ok := result["checks"].([]map[string]string); ok && len(checks) > 0 {
		fmt.Fprintln(output, "\nVerificaciones:")
		for _, check := range checks {
			icon := "·"
			if check["status"] == "ok" {
				icon = "✓"
			} else if check["status"] == "invalid" || check["status"] == "missing" {
				icon = "✗"
			}
			fmt.Fprintf(output, "  %s %s: %s\n", icon, check["name"], check["message"])
		}
	}
	if lifecycle, ok := result["lifecycle"].(core.Lifecycle); ok {
		fmt.Fprintln(output, "\nMemorias:")
		fmt.Fprintf(output, "  Total: %d · Activas: %d · Para revisar: %d · Archivadas: %d\n", lifecycle.Total, lifecycle.ByStatus["active"], lifecycle.ByStatus["needs_review"], lifecycle.ByStatus["archived"])
		fmt.Fprintf(output, "  Futuras: %d · Vencidas: %d · Revisión pendiente: %d\n", lifecycle.Future, lifecycle.Expired, lifecycle.DueForReview)
	}
	return nil
}

func inspectCodexSetup(filename string) map[string]string {
	contents, err := os.ReadFile(filename)
	if os.IsNotExist(err) {
		return map[string]string{"name": "codex_mcp", "status": "not_configured", "message": "Run ytk-memory setup codex to register the native MCP server."}
	}
	if err != nil {
		return map[string]string{"name": "codex_mcp", "status": "invalid", "message": err.Error()}
	}
	text := string(contents)
	begin, end := strings.Index(text, "# BEGIN ytk-memory-init:codex"), strings.Index(text, "# END ytk-memory-init:codex")
	if begin < 0 && end < 0 {
		return map[string]string{"name": "codex_mcp", "status": "not_configured", "message": "No native Codex MCP registration was found."}
	}
	if begin < 0 || end < begin {
		return map[string]string{"name": "codex_mcp", "status": "invalid", "message": "Managed Codex MCP block is incomplete."}
	}
	block := text[begin:end]
	if !strings.Contains(block, `args = ["mcp"]`) {
		return map[string]string{"name": "codex_mcp", "status": "invalid", "message": "The global Codex MCP registration must use the generic `mcp` command."}
	}
	match := regexp.MustCompile(`(?m)^command\s*=\s*"([^"]+)"\s*$`).FindStringSubmatch(block)
	if len(match) != 2 {
		return map[string]string{"name": "codex_mcp", "status": "invalid", "message": "Managed Codex MCP command is missing."}
	}
	if _, err := os.Stat(match[1]); err != nil {
		return map[string]string{"name": "codex_mcp", "status": "invalid", "message": "Registered native executable is unavailable."}
	}
	return map[string]string{"name": "codex_mcp", "status": "ok", "message": "Native MCP executable is registered and available."}
}
func doBackup(c config, target string, overwrite, jsonOutput bool) error {
	if target == "" {
		return errors.New("--to is required.")
	}
	return backup(c.database, target, c.project, overwrite, "backup", jsonOutput)
}
func doUpgrade(c config, target string, overwrite, jsonOutput bool) error {
	if target == "" {
		return errors.New("--backup-to is required.")
	}
	if _, err := os.Stat(c.database); err != nil {
		return fmt.Errorf("Database does not exist: %s", c.database)
	}
	backupPath, err := makeBackup(c.database, target, overwrite)
	if err != nil {
		return err
	}
	s, err := core.Open(c.database, nil)
	if err != nil {
		return err
	}
	s.Close()
	result := map[string]any{"operation": "upgrade", "projectId": c.project, "database": c.database, "backup": backupPath, "schema": "current"}
	if jsonOutput {
		return json.NewEncoder(os.Stdout).Encode(result)
	}
	fmt.Fprintln(os.Stdout, "Actualización completada")
	fmt.Fprintf(os.Stdout, "Proyecto: %s\nBase de datos: %s\nBackup previo: %s\nEsquema: %s\n", c.project, c.database, backupPath.DestinationFile, result["schema"])
	return nil
}
func doRollback(c config, source, current string, confirmed, jsonOutput bool) error {
	if !confirmed {
		return errors.New("Rollback requires --confirm.")
	}
	if source == "" || current == "" {
		return errors.New("--from and --backup-current-to are required.")
	}
	src, _ := filepath.Abs(source)
	dst := c.database
	safe, _ := filepath.Abs(current)
	if src == dst || safe == dst || src == safe {
		return errors.New("Rollback paths must be distinct.")
	}
	if _, err := os.Stat(src); err != nil {
		return fmt.Errorf("Rollback source does not exist: %s", src)
	}
	safeBackup, err := makeBackup(dst, safe, false)
	if err != nil {
		return err
	}
	restore := dst + ".rollback.tmp"
	if _, err := os.Stat(restore); err == nil {
		return fmt.Errorf("Temporary rollback file already exists: %s", restore)
	}
	sourceStore, err := core.Open(src, nil)
	if err != nil {
		return err
	}
	_, err = sourceStore.Backup(context.Background(), restore)
	sourceStore.Close()
	if err != nil {
		return err
	}
	verify, err := core.Open(restore, nil)
	if err != nil {
		os.Remove(restore)
		return err
	}
	verify.Close()
	if err = os.Remove(dst); err != nil {
		return err
	}
	_ = os.Remove(dst + "-wal")
	_ = os.Remove(dst + "-shm")
	if err = os.Rename(restore, dst); err != nil {
		return err
	}
	result := map[string]string{"operation": "rollback", "database": dst, "restoredFrom": src, "backupCurrentTo": safeBackup.DestinationFile}
	if jsonOutput {
		return json.NewEncoder(os.Stdout).Encode(result)
	}
	fmt.Fprintln(os.Stdout, "Restauración completada")
	fmt.Fprintf(os.Stdout, "Base restaurada: %s\nCopia restaurada: %s\nRespaldo de la base anterior: %s\n", result["database"], result["restoredFrom"], result["backupCurrentTo"])
	return nil
}
func backup(database, target, project string, overwrite bool, operation string, jsonOutput bool) error {
	p, err := makeBackup(database, target, overwrite)
	if err != nil {
		return err
	}
	result := map[string]any{"operation": operation, "projectId": project, "destinationFile": p.DestinationFile, "totalPages": p.TotalPages, "remainingPages": p.RemainingPages}
	if jsonOutput {
		return json.NewEncoder(os.Stdout).Encode(result)
	}
	fmt.Fprintln(os.Stdout, "Copia de seguridad completada")
	fmt.Fprintf(os.Stdout, "Proyecto: %s\nArchivo: %s\nPáginas copiadas: %d\n", project, p.DestinationFile, p.TotalPages-p.RemainingPages)
	return nil
}
func makeBackup(database, target string, overwrite bool) (core.BackupResult, error) {
	src, _ := filepath.Abs(database)
	dst, err := filepath.Abs(target)
	if err != nil {
		return core.BackupResult{}, err
	}
	if src == dst {
		return core.BackupResult{}, errors.New("Backup destination must differ from the database.")
	}
	if _, err = os.Stat(dst); err == nil {
		if !overwrite {
			return core.BackupResult{}, errors.New("Backup destination already exists; pass --overwrite.")
		}
		if err = os.Remove(dst); err != nil {
			return core.BackupResult{}, err
		}
	}
	if err = os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return core.BackupResult{}, err
	}
	store, err := core.Open(src, nil)
	if err != nil {
		return core.BackupResult{}, err
	}
	result, err := store.Backup(context.Background(), dst)
	store.Close()
	if err != nil {
		return core.BackupResult{}, err
	}
	result.DestinationFile = dst
	return result, nil
}
func conformanceArguments(args []string) (string, string, error) {
	var fixture, database string
	for i := 0; i < len(args); i++ {
		if i+1 >= len(args) {
			return "", "", fmt.Errorf("argument '%s' requires a value", args[i])
		}
		switch args[i] {
		case "--conformance-fixture":
			fixture = args[i+1]
		case "--database":
			database = args[i+1]
		default:
			return "", "", fmt.Errorf("unexpected argument '%s'", args[i])
		}
		i++
	}
	if fixture == "" || database == "" {
		return "", "", errors.New("--conformance-fixture and --database are required")
	}
	return fixture, database, nil
}

func evaluationArguments(args []string) (string, string, error) {
	var fixture, database string
	for i := 0; i < len(args); i++ {
		if i+1 >= len(args) {
			return "", "", fmt.Errorf("argument '%s' requires a value", args[i])
		}
		switch args[i] {
		case "--evaluation-fixture":
			fixture = args[i+1]
		case "--database":
			database = args[i+1]
		default:
			return "", "", fmt.Errorf("unexpected argument '%s'", args[i])
		}
		i++
	}
	if fixture == "" || database == "" {
		return "", "", errors.New("--evaluation-fixture and --database are required")
	}
	return fixture, database, nil
}
