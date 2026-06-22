#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
#  Factory Assistant MES — Update script
# ═══════════════════════════════════════════════════════════════

BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
RESET='\033[0m'

ok()   { echo -e "${GREEN}✓${RESET} $1"; }
fail() { echo -e "${RED}✗${RESET} $1"; exit 1; }

echo ""
echo -e "${BOLD}════════════════════════════════${RESET}"
echo -e "${BOLD}  Factory Assistant MES — Update${RESET}"
echo -e "${BOLD}════════════════════════════════${RESET}"
echo ""

# Controleer of we in de juiste map staan
if [ ! -f docker-compose.yml ]; then
  fail "Voer dit script uit vanuit de DS_MES map:\n    cd DS_MES && ./update.sh"
fi

# ── Stap 1: Back-up maken ────────────────────────────────────

echo -e "${BOLD}[1/5] Back-up maken vóór update...${RESET}"
bash backup.sh
ok "Back-up gemaakt"

# ── Stap 2: Laatste code ophalen ─────────────────────────────

echo ""
echo -e "${BOLD}[2/5] Laatste code ophalen...${RESET}"
git pull origin main
ok "Code bijgewerkt"

# ── Stap 3: Images herbouwen ─────────────────────────────────

echo ""
echo -e "${BOLD}[3/5] Docker images herbouwen...${RESET}"
docker compose -f docker-compose.yml build
ok "Images herbouwd"

# ── Stap 4: Herstarten ───────────────────────────────────────

echo ""
echo -e "${BOLD}[4/5] Herstarten...${RESET}"
docker compose -f docker-compose.yml up -d
ok "Containers herstart (database en uploads blijven behouden — volumes worden nooit verwijderd)"

# Wacht tot backend klaar is (max 60 sec)
echo "  Wachten tot backend klaar is..."
MAX_WAIT=60
ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
  if docker compose -f docker-compose.yml exec -T backend wget -qO- http://localhost:3000/health 2>/dev/null | grep -q '"status"'; then
    break
  fi
  printf "."
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done
echo ""
if [ $ELAPSED -ge $MAX_WAIT ]; then
  echo -e "${RED}  ⚠ Backend reageert nog niet — controleer: docker compose logs backend${RESET}"
else
  ok "Backend bereikbaar"
fi

echo ""
SERVER_IP=$(hostname -I | awk '{print $1}')
echo -e "${BOLD}════════════════════════════════${RESET}"
echo -e "${BOLD}  ✓ Update voltooid${RESET}"
echo -e "${BOLD}════════════════════════════════${RESET}"
echo ""
echo -e "  ${CYAN}http://${SERVER_IP}:8080/kiosk${RESET}"
echo -e "  ${CYAN}http://${SERVER_IP}:8080/admin/login${RESET}"
echo ""
echo "  Database migraties zijn automatisch uitgevoerd."
echo "  Data (database + uploads) is behouden — volumes worden nooit verwijderd door dit script."
echo ""

# ── Stap 5: Health check ──────────────────────────────────────

echo -e "${BOLD}[5/5] Health check uitvoeren...${RESET}"
bash doctor.sh || true
