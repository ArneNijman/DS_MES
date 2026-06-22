#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
#  Factory Assistant MES — Backup script
#  Gebruik: ./backup.sh
#  Automatisch via cron (elke zondag om 02:00):
#    0 2 * * 0 cd /pad/naar/DS_MES && ./backup.sh >> backups/backup.log 2>&1
# ═══════════════════════════════════════════════════════════════

BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
RESET='\033[0m'

ok()   { echo -e "${GREEN}✓${RESET} $1"; }
fail() { echo -e "${RED}✗${RESET} $1"; exit 1; }

if [ ! -f docker-compose.yml ]; then
  echo -e "${RED}✗ Voer dit script uit vanuit de DS_MES map:${RESET}"
  echo "    cd DS_MES && ./backup.sh"
  exit 1
fi

# .env laden zodat POSTGRES_USER / POSTGRES_DB beschikbaar zijn
if [ -f .env ]; then
  set -a; source .env 2>/dev/null; set +a
fi

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M)
KEEP_MIN=5
DB_USER="${POSTGRES_USER:-mes}"
DB_NAME="${POSTGRES_DB:-mes}"

echo ""
echo -e "${BOLD}════════════════════════════════${RESET}"
echo -e "${BOLD}  Factory Assistant MES — Backup${RESET}"
echo -e "${BOLD}════════════════════════════════${RESET}"
echo ""

# Controleer of Docker Compose draait
if ! docker compose ps --services --filter status=running | grep -q "postgres"; then
  fail "PostgreSQL container draait niet. Start het MES eerst met: docker compose up -d"
fi

mkdir -p "$BACKUP_DIR"

# ── Database ─────────────────────────────────────────────────

echo -e "${BOLD}[1/2] Database back-uppen...${RESET}"
docker compose exec -T postgres pg_dump -U "$DB_USER" "$DB_NAME" \
  | gzip > "${BACKUP_DIR}/db_${TIMESTAMP}.sql.gz"
ok "Database: backups/db_${TIMESTAMP}.sql.gz"

# ── Uploads ──────────────────────────────────────────────────

echo ""
echo -e "${BOLD}[2/2] Uploads back-uppen...${RESET}"
docker compose exec -T backend tar czf - /app/uploads \
  > "${BACKUP_DIR}/uploads_${TIMESTAMP}.tar.gz"
ok "Uploads: backups/uploads_${TIMESTAMP}.tar.gz"

# ── Opruimen (minimum KEEP_MIN bewaren, oudste verwijderen) ──

DB_COUNT=$(ls -1 "${BACKUP_DIR}"/db_*.sql.gz 2>/dev/null | wc -l)
if [ "$DB_COUNT" -gt "$KEEP_MIN" ]; then
  ls -1t "${BACKUP_DIR}"/db_*.sql.gz | tail -n +$((KEEP_MIN + 1)) | xargs rm -f
fi

UL_COUNT=$(ls -1 "${BACKUP_DIR}"/uploads_*.tar.gz 2>/dev/null | wc -l)
if [ "$UL_COUNT" -gt "$KEEP_MIN" ]; then
  ls -1t "${BACKUP_DIR}"/uploads_*.tar.gz | tail -n +$((KEEP_MIN + 1)) | xargs rm -f
fi

# ── Samenvatting ─────────────────────────────────────────────

echo ""
DB_SIZE=$(du -sh "${BACKUP_DIR}/db_${TIMESTAMP}.sql.gz"      | cut -f1)
UL_SIZE=$(du -sh "${BACKUP_DIR}/uploads_${TIMESTAMP}.tar.gz" | cut -f1)

echo -e "${BOLD}════════════════════════════════${RESET}"
echo -e "${BOLD}  ✓ Backup voltooid${RESET}"
echo -e "${BOLD}════════════════════════════════${RESET}"
echo ""
echo "  Map     : ${BACKUP_DIR}/"
echo "  Database: db_${TIMESTAMP}.sql.gz  (${DB_SIZE})"
echo "  Uploads : uploads_${TIMESTAMP}.tar.gz  (${UL_SIZE})"
echo "  Bewaren : minimaal ${KEEP_MIN} backups (oudste verwijderd boven dit aantal)"
echo ""
echo "  Terugzetten database:"
echo "    gunzip -c backups/db_<datum>.sql.gz | docker compose exec -T postgres psql -U \"$DB_USER\" \"$DB_NAME\""
echo ""
