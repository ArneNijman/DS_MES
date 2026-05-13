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

# ── Stap 1: Laatste code ophalen ─────────────────────────────

echo -e "${BOLD}[1/3] Laatste code ophalen...${RESET}"
git pull origin main
ok "Code bijgewerkt"

# ── Stap 2: Images herbouwen ─────────────────────────────────

echo ""
echo -e "${BOLD}[2/3] Docker images herbouwen...${RESET}"
docker compose build
ok "Images herbouwd"

# ── Stap 3: Herstarten ───────────────────────────────────────

echo ""
echo -e "${BOLD}[3/3] Herstarten...${RESET}"
docker compose up -d
ok "Containers herstarten (database en uploads blijven behouden — volumes worden nooit verwijderd)"

# Wacht even en toon status
sleep 5

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
