package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/corporate-knowledge/ytk-memory/internal/core"
)

func main() {
	if len(os.Args) < 2 || os.Args[1] != "conformance" {
		fmt.Fprintln(os.Stderr, "usage: ytk-memory conformance --conformance-fixture <path> --database <path>")
		os.Exit(2)
	}
	fixture, database, err := conformanceArguments(os.Args[2:])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	report, err := core.RunConformance(fixture, database)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if err := json.NewEncoder(os.Stdout).Encode(report); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func conformanceArguments(args []string) (string, string, error) {
	var fixture, database string
	for index := 0; index < len(args); index += 2 {
		if index+1 >= len(args) {
			return "", "", fmt.Errorf("argument '%s' requires a value", args[index])
		}
		switch args[index] {
		case "--conformance-fixture":
			fixture = args[index+1]
		case "--database":
			database = args[index+1]
		default:
			return "", "", fmt.Errorf("unexpected argument '%s'", args[index])
		}
	}
	if fixture == "" || database == "" {
		return "", "", fmt.Errorf("--conformance-fixture and --database are required")
	}
	return fixture, database, nil
}
