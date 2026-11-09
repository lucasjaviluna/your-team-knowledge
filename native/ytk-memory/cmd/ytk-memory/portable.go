package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/corporate-knowledge/ytk-memory/internal/core"
)

func runPortable(command string, args []string) error {
	flags := flag.NewFlagSet(command, flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	project := flags.String("project", "", "project ID")
	database := flags.String("database", "", "SQLite path")
	area := flags.String("area", "", "memory area")
	from := flags.String("from", "", "portable source file")
	to := flags.String("to", "", "new portable destination file")
	ids := flags.String("ids", "", "comma-separated memory IDs")
	token := flags.String("token", "", "reviewed preview token")
	confirm := flags.Bool("confirm", false, "confirm reviewed import")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if flags.NArg() != 0 {
		return errors.New("unexpected argument")
	}
	switch command {
	case "portable-export":
		if *to == "" || strings.TrimSpace(*ids) == "" || *from != "" || *token != "" || *confirm {
			return errors.New("portable-export requires --to and --ids")
		}
	case "portable-preview":
		if *from == "" || *to != "" || *ids != "" || *token != "" || *confirm {
			return errors.New("portable-preview requires --from")
		}
	case "portable-import":
		if *from == "" || *token == "" || !*confirm || *to != "" || *ids != "" {
			return errors.New("portable-import requires --from, --token and --confirm")
		}
	}
	cfg, err := resolve(*project, *database, *area, false)
	if err != nil {
		return err
	}
	info, err := os.Stat(cfg.database)
	if err != nil || !info.Mode().IsRegular() {
		return errors.New("configured memory database is not an existing regular file")
	}
	var st *core.Store
	if command == "portable-preview" {
		st, err = core.OpenReadOnly(cfg.database, nil)
	} else {
		st, err = core.Open(cfg.database, nil)
	}
	if err != nil {
		return err
	}
	defer st.Close()
	ctx := context.Background()
	if command == "portable-export" {
		selected := strings.Split(*ids, ",")
		for i := range selected {
			selected[i] = strings.TrimSpace(selected[i])
		}
		data, err := st.ExportPortable(ctx, cfg.project, cfg.area, selected)
		if err != nil {
			return err
		}
		if err = writePortableFile(*to, data); err != nil {
			return err
		}
		return json.NewEncoder(os.Stdout).Encode(map[string]any{"exported": len(selected), "path": *to})
	}
	file, err := os.Open(*from)
	if err != nil {
		return err
	}
	data, err := io.ReadAll(io.LimitReader(file, core.PortableMaxBytes+1))
	closeErr := file.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	if len(data) > core.PortableMaxBytes {
		return errors.New("portable file exceeds size limit")
	}
	if command == "portable-preview" {
		result, err := st.PreviewPortable(ctx, cfg.project, cfg.area, data)
		if err != nil {
			return err
		}
		return json.NewEncoder(os.Stdout).Encode(result)
	}
	result, err := st.ImportPortable(ctx, cfg.project, cfg.area, data, *token)
	if err != nil {
		return err
	}
	return json.NewEncoder(os.Stdout).Encode(result)
}

// A hard link publishes atomically without replacing a pre-existing path.
func writePortableFile(path string, data []byte) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".ytk-export-*")
	if err != nil {
		return err
	}
	name := tmp.Name()
	defer os.Remove(name)
	if err = tmp.Chmod(0600); err != nil {
		tmp.Close()
		return err
	}
	if _, err = tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err = tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err = tmp.Close(); err != nil {
		return err
	}
	if err = os.Link(name, path); err != nil {
		return fmt.Errorf("cannot publish new export file: %w", err)
	}
	return nil
}
