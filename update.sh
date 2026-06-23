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

# Stash lokale wijzigingen zodat git pull niet blokkeert
STASH_OUT=$(git stash 2>&1)
if echo "$STASH_OUT" | grep -q "No local changes"; then
  STASHED=false
else
  STASHED=true
  ok "Lokale wijzigingen tijdelijk opgeslagen (git stash)"
fi

git pull origin main
ok "Code bijgewerkt"

# Herstel lokale wijzigingen na de pull
if [ "$STASHED" = "true" ]; then
  if git stash pop; then
    ok "Lokale wijzigingen hersteld (git stash pop)"
  else
    echo -e "${RED}  ⚠ Stash pop mislukt — los conflicten op met: git stash pop${RESET}"
  fi
fi

# ── Stap 3: Images herbouwen ─────────────────────────────────

echo ""
echo -e "${BOLD}[3/5] Docker images herbouwen...${RESET}"
docker compose -f docker-compose.yml -f docker-compose.dev.yml build
ok "Images herbouwd"

# ── Stap 4: Herstarten ───────────────────────────────────────

echo ""
echo -e "${BOLD}[4/5] Herstarten...${RESET}"
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
ok "Containers herstart (database en uploads blijven behouden — volumes worden nooit verwijderd)"

sleep 5
ok "Containers herstart"

echo ""
SERVER_IP=$(hostname -I | awk '{print $1}')
echo -e "${BOLD}════════════════════════════════${RESET}"
echo -e "${BOLD}  ✓ Update voltooid${RESET}"
echo -e "${BOLD}════════════════════════════════${RESET}"
echo ""
echo -e "  ${CYAN}http://${SERVER_IP}:5173/kiosk${RESET}"
echo -e "  ${CYAN}http://${SERVER_IP}:5173/admin/login${RESET}"
echo ""
echo "  Database migraties zijn automatisch uitgevoerd."
echo "  Data (database + uploads) is behouden — volumes worden nooit verwijderd door dit script."
echo ""

# ── Stap 5: Health check ──────────────────────────────────────

echo -e "${BOLD}[5/5] Health check uitvoeren...${RESET}"
bash doctor.sh || true
