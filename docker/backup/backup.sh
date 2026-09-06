#!/bin/sh
set -e

BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d-%H%M%S)
HOST="${PGHOST:-postgres}"
USER="${PGUSER:-postgres}"
OUT="${BACKUP_DIR}/teamspace-one-${DATE}.sql"

mkdir -p "${BACKUP_DIR}"
echo "Backing up all databases from ${HOST} to ${OUT}..."
PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}}" pg_dumpall -h "${HOST}" -U "${USER}" -f "${OUT}"
echo "Backup written to ${OUT}"
