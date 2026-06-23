#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  Factory Assistant MES — Doctor
#  Controleert de systeemgezondheid. Stopt nooit bij een fout.
# ═══════════════════════════════════════════════════════════════

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
DIM='\033[2m'
RESET='\033[0m'

PASS=0
WARN=0
FAIL=0

ok()   { echo -e "  ${GREEN}✓${RESET} $1"; PASS=$((PASS + 1)); }
warn() { echo -e "  ${YELLOW}⚠${RESET} $1"; WARN=$((WARN + 1)); }
fail() { echo -e "  ${RED}✗${RESET} $1"; FAIL=$((FAIL + 1)); }
info() { echo -e "  ${DIM}  $1${RESET}"; }

echo ""
echo -e "${BOLD}════════════════════════════════════${RESET}"
echo -e "${BOLD}  Factory Assistant MES — Doctor${RESET}"
echo -e "${BOLD}════════════════════════════════════${RESET}"

# ── 0. Locatiecheck ───────────────────────────────────────────
if [ ! -f docker-compose.yml ]; then
  echo -e "${RED}✗ Voer dit script uit vanuit de MES-map:${RESET}"
  echo "    cd DS_MES && ./doctor.sh"
  exit 1
fi

# .env laden
if [ -f .env ]; then
  set -a; source .env 2>/dev/null; set +a
fi

# ── 1. Environment ────────────────────────────────────────────
echo ""
echo -e "${BOLD}[ Environment ]${RESET}"

for var in DATABASE_URL REDIS_URL JWT_SECRET BC_ENCRYPTION_KEY; do
  if [ -n "${!var:-}" ]; then
    ok "$var"
  else
    fail "$var — niet ingesteld in .env"
  fi
done

# ── 2. Docker containers ──────────────────────────────────────
echo ""
echo -e "${BOLD}[ Docker ]${RESET}"

if ! docker compose ps --format '{{.Name}} {{.State}}' 2>/dev/null | grep -q .; then
  fail "Docker compose niet bereikbaar of geen containers"
else
  while IFS= read -r line; do
    name=$(echo "$line" | awk '{print $1}')
    state=$(echo "$line" | awk '{print $2}')
    short=$(echo "$name" | sed 's/.*-\([a-z]*\)-[0-9]*/\1/')
    if [ "$state" = "running" ]; then
      ok "$short ($state)"
    else
      fail "$short — $state"
    fi
  done < <(docker compose ps --format '{{.Name}} {{.State}}' 2>/dev/null)
fi

# ── 3. Services ───────────────────────────────────────────────
echo ""
echo -e "${BOLD}[ Services ]${RESET}"

# Backend HTTP
HEALTH=$(docker compose exec -T backend wget -qO- http://localhost:3000/health 2>/dev/null || echo "")
if echo "$HEALTH" | grep -q '"status"'; then
  ok "Backend bereikbaar"
else
  fail "Backend niet bereikbaar"
fi

# Database
if docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-mes}" -q 2>/dev/null; then
  ok "Database bereikbaar"
else
  fail "Database niet bereikbaar"
fi

# Migraties
MIGRATION_FILES=$(ls backend/src/db/migrations/*.sql 2>/dev/null | wc -l | tr -d ' ')
APPLIED=$(docker compose exec -T postgres psql -U "${POSTGRES_USER:-mes}" -d "${POSTGRES_DB:-mes}" -t -c \
  "SELECT COUNT(*) FROM mes_migrations;" 2>/dev/null | tr -d ' \n' || echo "0")

if [ "$MIGRATION_FILES" = "$APPLIED" ]; then
  ok "Migraties up-to-date ($APPLIED/$MIGRATION_FILES)"
elif [ "$APPLIED" -lt "$MIGRATION_FILES" ] 2>/dev/null; then
  APPLIED_NAMES=$(docker compose exec -T postgres psql -U "${POSTGRES_USER:-mes}" -d "${POSTGRES_DB:-mes}" -t -c \
    "SELECT filename FROM mes_migrations ORDER BY applied_at;" 2>/dev/null | \
    tr -d ' ' | grep -v '^$')
  DIFF=$((MIGRATION_FILES - APPLIED))
  fail "Migraties: $APPLIED/$MIGRATION_FILES toegepast — $DIFF openstaand"
  # Toon welke bestanden ontbreken
  for f in backend/src/db/migrations/*.sql; do
    fname=$(basename "$f")
    if ! echo "$APPLIED_NAMES" | grep -qF "$fname"; then
      info "→ Niet applied: $fname"
    fi
  done
else
  warn "Migraties: kon niet vergelijken ($APPLIED applied, $MIGRATION_FILES bestanden)"
fi

# CNC agent
CNC_URL="${CNC_AGENT_URL:-http://localhost:3099}"
# Zet host.docker.internal om naar localhost voor checks vanaf de host
CNC_CHECK_URL=$(echo "$CNC_URL" | sed 's|host\.docker\.internal|localhost|')
CNC_HEALTH=$(curl -s --max-time 5 "${CNC_CHECK_URL}/health" 2>/dev/null || echo "")
if echo "$CNC_HEALTH" | grep -q '"ok":true'; then
  ok "CNC agent bereikbaar ($CNC_CHECK_URL)"
else
  warn "CNC agent niet bereikbaar op $CNC_CHECK_URL"
fi

# Firewall regel CNC Agent (alleen op Windows)
if command -v powershell.exe &>/dev/null || command -v pwsh &>/dev/null; then
  PS=$(command -v powershell.exe || command -v pwsh)
  FW=$("$PS" -NoProfile -NonInteractive -Command \
    "try { \$r = Get-NetFirewallRule -DisplayName 'CNC Agent' -ErrorAction Stop; 'found' } catch { 'missing' }" \
    2>/dev/null || echo "unknown")
  if [ "$FW" = "found" ]; then
    ok "Firewall regel 'CNC Agent' (poort 3099) aanwezig"
  elif [ "$FW" = "missing" ]; then
    warn "Firewall regel 'CNC Agent' niet gevonden — poort 3099 mogelijk geblokkeerd"
    info "→ New-NetFirewallRule -DisplayName 'CNC Agent' -Direction Inbound -Protocol TCP -LocalPort 3099 -Action Allow"
  fi
fi

# ── 4. Machines TCP bereikbaarheid ────────────────────────────
echo ""
echo -e "${BOLD}[ Machines ]${RESET}"

MACHINES=$(docker compose exec -T postgres psql -U "${POSTGRES_USER:-mes}" -d "${POSTGRES_DB:-mes}" -t -A -F'|' -c \
  "SELECT name, cnc_ip_address FROM machines WHERE is_active = true AND category = 'Freesmachine' AND cnc_ip_address IS NOT NULL;" \
  2>/dev/null || echo "")

if [ -z "$MACHINES" ]; then
  info "Geen Freesmachines met IP-adres geconfigureerd"
else
  while IFS='|' read -r mname mip; do
    [ -z "$mname" ] && continue
    mname=$(echo "$mname" | tr -d ' ')
    mip=$(echo "$mip" | tr -d ' ')
    if timeout 3 bash -c "echo >/dev/tcp/$mip/19000" 2>/dev/null; then
      ok "$mname ($mip) TCP bereikbaar (LSV2 poort 19000)"
    else
      warn "$mname ($mip) niet bereikbaar op poort 19000 (LSV2)"
    fi
  done <<< "$MACHINES"
fi

# ── 5. Systeem ────────────────────────────────────────────────
echo ""
echo -e "${BOLD}[ Systeem ]${RESET}"

# Schijfruimte
DISK=$(df -h . 2>/dev/null | tail -1)
DISK_PCT=$(echo "$DISK" | awk '{print $5}' | tr -d '%')
DISK_FREE=$(echo "$DISK" | awk '{print $4}')
if [ -n "$DISK_PCT" ] && [ "$DISK_PCT" -ge 85 ] 2>/dev/null; then
  warn "Schijfruimte laag: $((100 - DISK_PCT))% vrij ($DISK_FREE beschikbaar)"
elif [ -n "$DISK_PCT" ]; then
  ok "Schijfruimte: $((100 - DISK_PCT))% vrij ($DISK_FREE beschikbaar)"
fi

# Git versie
GIT_INFO=$(git log -1 --format="%h — %cd" --date=format:"%Y-%m-%d" 2>/dev/null || echo "onbekend")
info "Versie: $GIT_INFO"

# Server IP
SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
[ -n "$SERVER_IP" ] && info "Adres:  ${CYAN}http://${SERVER_IP}:5173/admin/login${RESET}"

# ── Samenvatting ──────────────────────────────────────────────
echo ""
echo -e "${BOLD}════════════════════════════════════${RESET}"
SUMMARY=""
[ "$PASS" -gt 0 ] && SUMMARY="${GREEN}✓ $PASS ok${RESET}"
[ "$WARN" -gt 0 ] && SUMMARY="$SUMMARY  ${YELLOW}⚠ $WARN waarschuwingen${RESET}"
[ "$FAIL" -gt 0 ] && SUMMARY="$SUMMARY  ${RED}✗ $FAIL fouten${RESET}"
echo -e "  $SUMMARY"
echo -e "${BOLD}════════════════════════════════════${RESET}"
echo ""

[ "$FAIL" -gt 0 ] && exit 1
exit 0
