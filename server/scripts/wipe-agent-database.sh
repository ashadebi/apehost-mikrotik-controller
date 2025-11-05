#!/bin/bash
#
# Wipe Agent Database Script
# Clears all entries from the AI Agent database while preserving schema
#
# Usage: ./scripts/wipe-agent-database.sh
#

set -e

DB_PATH="./data/agent.db"
BACKUP_DIR="./data/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "==================================================================="
echo "  AI Agent Database Wipe Script"
echo "==================================================================="
echo ""

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    echo "Error: Database not found at $DB_PATH"
    exit 1
fi

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Create backup
BACKUP_FILE="${BACKUP_DIR}/agent_db_backup_${TIMESTAMP}.db"
echo "Step 1: Creating backup at $BACKUP_FILE"
cp "$DB_PATH" "$BACKUP_FILE"
echo "  Backup created successfully"
echo ""

# Get current row counts
echo "Step 2: Current database state:"
echo "-------------------------------------------------------------------"
sqlite3 "$DB_PATH" <<EOF
SELECT 'issues', COUNT(*) FROM issues
UNION ALL SELECT 'metrics_snapshots', COUNT(*) FROM metrics_snapshots
UNION ALL SELECT 'detection_history', COUNT(*) FROM detection_history
UNION ALL SELECT 'troubleshooting_sessions', COUNT(*) FROM troubleshooting_sessions
UNION ALL SELECT 'session_steps', COUNT(*) FROM session_steps
UNION ALL SELECT 'system_metrics_history', COUNT(*) FROM system_metrics_history
UNION ALL SELECT 'issue_feedback', COUNT(*) FROM issue_feedback
UNION ALL SELECT 'detection_evidence', COUNT(*) FROM detection_evidence
UNION ALL SELECT 'false_positive_patterns', COUNT(*) FROM false_positive_patterns
UNION ALL SELECT 'improvement_rules', COUNT(*) FROM improvement_rules
UNION ALL SELECT 'learning_metrics', COUNT(*) FROM learning_metrics;
EOF
echo "-------------------------------------------------------------------"
echo ""

# Confirm wipe
read -p "Are you sure you want to wipe all data? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Operation cancelled."
    exit 0
fi

echo ""
echo "Step 3: Wiping database entries..."
echo "-------------------------------------------------------------------"

# Wipe all tables (preserve migrations table for schema tracking)
sqlite3 "$DB_PATH" <<EOF
-- Disable foreign keys temporarily
PRAGMA foreign_keys = OFF;

-- Wipe all data tables
DELETE FROM issues;
DELETE FROM metrics_snapshots;
DELETE FROM detection_history;
DELETE FROM troubleshooting_sessions;
DELETE FROM session_steps;
DELETE FROM system_metrics_history;
DELETE FROM issue_feedback;
DELETE FROM detection_evidence;
DELETE FROM false_positive_patterns;
DELETE FROM improvement_rules;
DELETE FROM learning_metrics;

-- Reset autoincrement counters
DELETE FROM sqlite_sequence;

-- Re-enable foreign keys
PRAGMA foreign_keys = ON;

-- Vacuum to reclaim space
VACUUM;
EOF

echo "  All entries wiped successfully"
echo ""

# Verify wipe
echo "Step 4: Verifying clean state:"
echo "-------------------------------------------------------------------"
sqlite3 "$DB_PATH" <<EOF
SELECT 'issues', COUNT(*) FROM issues
UNION ALL SELECT 'metrics_snapshots', COUNT(*) FROM metrics_snapshots
UNION ALL SELECT 'detection_history', COUNT(*) FROM detection_history
UNION ALL SELECT 'troubleshooting_sessions', COUNT(*) FROM troubleshooting_sessions
UNION ALL SELECT 'session_steps', COUNT(*) FROM session_steps
UNION ALL SELECT 'system_metrics_history', COUNT(*) FROM system_metrics_history
UNION ALL SELECT 'issue_feedback', COUNT(*) FROM issue_feedback
UNION ALL SELECT 'detection_evidence', COUNT(*) FROM detection_evidence
UNION ALL SELECT 'false_positive_patterns', COUNT(*) FROM false_positive_patterns
UNION ALL SELECT 'improvement_rules', COUNT(*) FROM improvement_rules
UNION ALL SELECT 'learning_metrics', COUNT(*) FROM learning_metrics;
EOF
echo "-------------------------------------------------------------------"
echo ""

echo "==================================================================="
echo "  Database wipe completed successfully"
echo "==================================================================="
echo ""
echo "Backup location: $BACKUP_FILE"
echo "Database path: $DB_PATH"
echo ""
echo "To restore from backup, run:"
echo "  cp $BACKUP_FILE $DB_PATH"
echo ""
