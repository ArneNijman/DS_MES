#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
#  Factory Assistant MES — Installatie script
# ═══════════════════════════════════════════════════════════════

BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

ok()   { echo -e "${GREEN}✓${RESET} $1"; }
fail() { echo -e "${RED}✗${RESET} $1"; exit 1; }
info() { echo -e "${CYAN}→${RESET} $1"; }
warn() { echo -e "${YELLOW}!${RESET} $1"; }

echo ""
echo -e "${BOLD}═══════════════════════════════════════════${RESET}"
echo -e "${BOLD}  Factory Assistant MES — Installatie      ${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════${RESET}"
echo ""

# ── Stap 1: Controles ────────────────────────────────────────

echo -e "${BOLD}[1/4] Systeem controleren...${RESET}"

if ! command -v docker &>/dev/null; then
  fail "Docker niet gevonden. Installeer Docker eerst:\n    curl -fsSL https://get.docker.com | sh\n    sudo usermod -aG docker \$USER\n  Log daarna uit en weer in."
fi

if ! docker compose version &>/dev/null; then
  fail "Docker Compose v2 niet gevonden.\n  Controleer: docker compose version\n  Zie: https://docs.docker.com/compose/install/"
fi

if ! command -v openssl &>/dev/null; then
  fail "openssl niet gevonden. Installeer met: sudo apt install openssl -y"
fi

ok "Docker en Docker Compose beschikbaar"

# ── Stap 2: .env aanmaken ────────────────────────────────────

echo ""
echo -e "${BOLD}[2/4] Configuratie aanmaken...${RESET}"

if [ ! -f .env ]; then
  cp .env.example .env
  info ".env aangemaakt vanuit .env.example"

  # Genereer secrets
  POSTGRES_PASSWORD=$(openssl rand -hex 16)
  JWT_SECRET=$(openssl rand -hex 32)
  BC_ENCRYPTION_KEY=$(openssl rand -hex 32)

  # Patch .env — vervang alles na de = op die regels
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" .env
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://mes:${POSTGRES_PASSWORD}@postgres:5432/mes|" .env
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" .env
  sed -i "s|^BC_ENCRYPTION_KEY=.*|BC_ENCRYPTION_KEY=${BC_ENCRYPTION_KEY}|" .env

  ok ".env aangemaakt met automatisch gegenereerde secrets"
else
  ok ".env bestaat al — wordt niet overschreven"
fi

# ── Stap 3: Bouwen en starten ────────────────────────────────

echo ""
echo -e "${BOLD}[3/4] Docker images bouwen en starten...${RESET}"
echo "  (eerste keer duurt dit 3-5 minuten)"
echo ""

docker compose up --build -d

ok "Containers gestart"

# ── Stap 4: Wachten en credentials tonen ─────────────────────

echo ""
echo -e "${BOLD}[4/4] Wachten tot MES klaar is...${RESET}"

MAX_WAIT=120
ELAPSED=0

while [ $ELAPSED -lt $MAX_WAIT ]; do
  if docker compose logs backend 2>/dev/null | grep -q "Server listening"; then
    break
  fi
  printf "."
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done
echo ""

if [ $ELAPSED -ge $MAX_WAIT ]; then
  warn "Timeout — MES start mogelijk nog. Controleer met: docker compose logs backend"
else
  ok "MES is gestart"
fi

# Haal admin-wachtwoord op uit logs
ADMIN_PASS=$(docker compose logs backend 2>/dev/null | grep -o 'wachtwoord:[[:space:]]*[^ ]*' | tail -1 | awk '{print $2}')
if [ -z "$ADMIN_PASS" ]; then
  ADMIN_PASS=$(docker compose logs backend 2>/dev/null | grep -i 'seed\|admin\|password\|wachtwoord' | tail -3)
fi

# Detecteer server-IP
SERVER_IP=$(hostname -I | awk '{print $1}')

echo ""
echo -e "${BOLD}════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  ✓ MES GESTART${RESET}"
echo -e "${BOLD}════════════════════════════════════════════${RESET}"
echo ""
echo -e "  Kiosk : ${CYAN}http://${SERVER_IP}:8080/kiosk${RESET}"
echo -e "  Admin : ${CYAN}http://${SERVER_IP}:8080/admin/login${RESET}"
echo ""
echo -e "  Eerste inloggegevens — zie de backend logs:"
echo ""
docker compose logs backend 2>/dev/null | grep -i 'admin\|seed\|wachtwoord\|password\|gebruiker' | grep -v "^$" | tail -5 | sed 's/^/    /'
echo ""
echo -e "${YELLOW}  ⚠  Sla het wachtwoord op — het wordt niet opnieuw getoond.${RESET}"
echo -e "${BOLD}════════════════════════════════════════════${RESET}"
echo ""
echo "  Volgende stap: stel de CNC agent in op de Windows PC."
echo "  Zie README.md voor de exacte stappen."
echo ""
