package core

import (
	"context"
	"fmt"
	"strings"
)

// SchemaInspection describes what the normal migrator would change, without
// applying any of those changes.
type SchemaInspection struct {
	Ready               bool     `json:"ready"`
	UpgradeChanges      []string `json:"upgradeChanges"`
	Incompatibilities   []string `json:"incompatibilities"`
	CanInspectLifecycle bool     `json:"canInspectLifecycle"`
}

var requiredSchemaTables = []string{"sessions", "memory_items", "memory_relations", "memory_items_fts"}

var requiredSchemaColumns = map[string][]string{
	"sessions": {
		"id", "workspace_id", "owner_id", "started_at", "ended_at", "summary",
	},
	"memory_items": {
		"id", "workspace_id", "session_id", "type", "title", "content", "subject_key",
		"tags_json", "status", "created_at", "updated_at", "valid_from", "expires_at",
		"review_at", "archived_at",
	},
	"memory_relations": {
		"source_memory_id", "target_memory_id", "relation", "created_at",
	},
	"memory_items_fts": {
		"memory_id", "title", "content", "tags", "subject_key",
	},
}

var migratableSchemaColumns = map[string]map[string]string{
	"sessions": {
		"owner_id": "add nullable owner_id column to sessions",
	},
	"memory_items": {
		"valid_from":  "add valid_from column to memory_items",
		"expires_at":  "add expires_at column to memory_items",
		"review_at":   "add review_at column to memory_items",
		"archived_at": "add archived_at column to memory_items",
	},
}

var requiredSchemaIndexes = []string{
	"memory_items_workspace_status_idx",
	"memory_items_subject_key_idx",
	"memory_items_lifecycle_idx",
}

// InspectSchema compares the database with the schema expected by migrate.
// It is safe to call on a read-only connection and never writes schema state.
func (s *Store) InspectSchema(ctx context.Context) (SchemaInspection, error) {
	objects, err := s.db.QueryContext(ctx, `SELECT type, name FROM sqlite_master WHERE type IN ('table', 'index')`)
	if err != nil {
		return SchemaInspection{}, err
	}
	tables, indexes := map[string]bool{}, map[string]bool{}
	for objects.Next() {
		var objectType, name string
		if err := objects.Scan(&objectType, &name); err != nil {
			_ = objects.Close()
			return SchemaInspection{}, err
		}
		if objectType == "table" {
			tables[name] = true
		} else if objectType == "index" {
			indexes[name] = true
		}
	}
	if err := objects.Err(); err != nil {
		_ = objects.Close()
		return SchemaInspection{}, err
	}
	if err := objects.Close(); err != nil {
		return SchemaInspection{}, err
	}

	inspection := SchemaInspection{
		UpgradeChanges:    []string{},
		Incompatibilities: []string{},
	}
	for _, table := range requiredSchemaTables {
		if !tables[table] {
			if table == "memory_items_fts" {
				inspection.UpgradeChanges = append(inspection.UpgradeChanges, "create and backfill the memory_items_fts FTS5 index")
			} else {
				inspection.UpgradeChanges = append(inspection.UpgradeChanges, "create missing table "+table)
			}
			continue
		}

		columns, err := inspectTableColumns(ctx, s, table)
		if err != nil {
			return SchemaInspection{}, err
		}
		columnSet := make(map[string]bool, len(columns))
		for _, column := range columns {
			columnSet[column] = true
		}
		for _, expected := range requiredSchemaColumns[table] {
			if columnSet[expected] {
				continue
			}
			if change, ok := migratableSchemaColumns[table][expected]; ok {
				inspection.UpgradeChanges = append(inspection.UpgradeChanges, change)
			} else {
				inspection.Incompatibilities = append(inspection.Incompatibilities,
					fmt.Sprintf("table %s is missing required column %s which the automatic upgrade does not add", table, expected))
			}
		}
		if table == "memory_items" {
			// The migrator appends lifecycle columns in the same order as the
			// expected schema. A legacy table whose columns are an exact prefix
			// is therefore upgradeable; a missing middle column or unexpected
			// column would leave SELECT * scans misaligned after migration.
			if !isPrefix(columns, requiredSchemaColumns[table]) {
				inspection.Incompatibilities = append(inspection.Incompatibilities,
					"memory_items columns cannot be upgraded without changing the positional layout used by the current reader")
			}
		}
	}

	for _, index := range requiredSchemaIndexes {
		if !indexes[index] {
			inspection.UpgradeChanges = append(inspection.UpgradeChanges, "create missing index "+index)
		}
	}

	if tables["memory_items"] {
		columns, err := inspectTableColumns(ctx, s, "memory_items")
		if err != nil {
			return SchemaInspection{}, err
		}
		inspection.CanInspectLifecycle = equalStrings(columns, requiredSchemaColumns["memory_items"])
	}
	inspection.Ready = len(inspection.UpgradeChanges) == 0 && len(inspection.Incompatibilities) == 0
	return inspection, nil
}

func inspectTableColumns(ctx context.Context, store *Store, table string) ([]string, error) {
	// Callers pass names from the fixed schema map above, never user input.
	rows, err := store.db.QueryContext(ctx, fmt.Sprintf(`PRAGMA table_info("%s")`, strings.ReplaceAll(table, `"`, `""`)))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	columns := []string{}
	for rows.Next() {
		var cid, notNull, primaryKey int
		var name, kind string
		var defaultValue any
		if err := rows.Scan(&cid, &name, &kind, &notNull, &defaultValue, &primaryKey); err != nil {
			return nil, err
		}
		columns = append(columns, name)
	}
	return columns, rows.Err()
}

func equalStrings(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for i := range left {
		if left[i] != right[i] {
			return false
		}
	}
	return true
}

func isPrefix(columns, expected []string) bool {
	if len(columns) > len(expected) {
		return false
	}
	for i := range columns {
		if columns[i] != expected[i] {
			return false
		}
	}
	return true
}
