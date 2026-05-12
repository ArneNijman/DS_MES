# CNC Agent — Dutch Shape MES

Haalt automatisch TOOL.T bestanden op van Heidenhain CNC-machines via TNCcmd.exe
en stuurt ze naar de MES backend. Biedt ook een HTTP server zodat de Sync-knop
in de MES kiosk een directe sync kan triggeren.

---

## Inhoudsopgave

1. [Vereisten](#vereisten)
2. [Eerste installatie](#eerste-installatie)
3. [Automatisch starten bij Windows-login](#automatisch-starten-bij-windows-login)
4. [Handmatig starten](#handmatig-starten)
5. [Sync-knop in de kiosk](#sync-knop-in-de-kiosk)
6. [Hoe werkt de sync?](#hoe-werkt-de-sync)
7. [Probleemoplossing](#probleemoplossing)

---

## Vereisten

- Windows (TNCcmd.exe werkt alleen op Windows)
- Node.js 22 of hoger — controleer met `node --version`
- HEIDENHAIN TNCremo geïnstalleerd (bevat `TNCcmd.exe`)
- CNC-machines met een IP-adres ingesteld in het MES (Admin > Machines)

---

## Eerste installatie

### Stap 1 — .env aanmaken

Maak een kopie van `.env.example` en noem het `.env`:

```
Kopieer .env.example → .env
```

Open `.env` in Kladblok en vul de gegevens in:

```
BACKEND_URL=http://<server-ip>:8080     ← IP-adres van de Linux server (zie install.sh output)
ADMIN_USERNAME=admin
ADMIN_PASSWORD="jouw_wachtwoord"        ← wachtwoord uit de install.sh output; quotes verplicht als het een # bevat

TNCCMD_PATH=C:\Program Files (x86)\HEIDENHAIN\TNCremo\TNCcmd.exe
TNCCMD_TIMEOUT_MS=30000                 ← max wachttijd per machine (milliseconden)

SYNC_INTERVAL_MIN=30                    ← automatische sync elke 30 minuten
AGENT_PORT=3099                         ← HTTP poort voor de Sync-knop in de kiosk
```

Het server-IP en het admin-wachtwoord zijn getoond aan het einde van het `install.sh` script op de Linux server.

### Stap 2 — Testen of de agent werkt

Open een Command Prompt in deze map en voer uit:

```
node --env-file=.env cnc-agent.js --once
```

Je ziet dan zoiets als:

```
🔄  Sync gestart: 21-4-2026, 08:25:00
📋  5 machine(s) gevonden, 5 met IP-adres

🔌  BF 3200  (192.168.1.201)
   📥  TNCcmd: -i 192.168.1.201 "GET TOOL.T ..."
   ✅  55 tools geladen voor BF 3200

🔌  FPT Ronin  (192.168.1.205)
   ✅  112 tools geladen voor FPT Ronin

📊  Klaar: 5 geslaagd, 0 offline, 0 fout(en)
```

Als alles werkt, ga dan door naar stap 3.

### Stap 3 — Taakplanner installeren (eenmalig, als Administrator)

Zodat de agent automatisch start bij Windows-opstart en bij inloggen:

1. Open **PowerShell als administrator**
   (Startmenu → zoek "PowerShell" → rechtsklik → "Als administrator uitvoeren")
2. Navigeer naar de cnc-agent map:
   ```
   cd "C:\pad\naar\DS_MES\cnc-agent"
   ```
3. Voer het installatiescript uit:
   ```
   powershell -ExecutionPolicy Bypass -File install-scheduler.ps1
   ```
4. Je ziet de bevestiging:
   ```
   Taak 'DutchShape-CNC-Agent' geinstalleerd - start bij inloggen, draait continu
   ```
5. Herstart de PC — de agent start nu automatisch op de achtergrond

De taak is te beheren via **Taakplanner > Taakplanner-bibliotheek > DutchShape-CNC-Agent**.

---

## Automatisch starten bij Windows-opstart

Na de taakplanner-installatie (stap 3 hierboven) gebeurt het volgende bij elke opstart én bij inloggen:

- Agent start automatisch op de achtergrond
- Direct een eerste sync van alle CNC-machines
- Daarna elke 30 minuten automatisch opnieuw
- HTTP server op poort 3099 blijft actief voor de Sync-knop

De agent draait ook na een onbeheerde herstart (bijv. na stroomstoring) zonder dat iemand hoeft in te loggen. Je hoeft verder niets te doen.

---

## Handmatig starten

Als de taakplanner niet geïnstalleerd is, kun je de agent handmatig starten.

### Continue modus (aanbevolen — voor de Sync-knop)

Open een Command Prompt in deze map:

```
node --env-file=.env cnc-agent.js
```

- Agent blijft draaien zolang het venster open is
- Synct elke 30 minuten automatisch
- HTTP server op poort 3099 actief → Sync-knop in de kiosk werkt

### Eenmalige sync

Dubbelklik op `run.bat`, of via Command Prompt:

```
node --env-file=.env cnc-agent.js --once
```

- Synct één keer alle machines
- Sluit daarna af
- HTTP server start **niet** → Sync-knop in de kiosk werkt **niet**

---

## Sync-knop in de kiosk

De MES kiosk heeft een **Sync-knop** op de CNC Machining pagina.

**Wat gebeurt er als je op Sync drukt:**

1. Kiosk stuurt een verzoek naar de MES backend
2. Backend stuurt een verzoek naar de agent op poort 3099
3. Agent start direct een sync van alle CNC-machines via TNCcmd
4. Kiosk vernieuwt automatisch de data elke 4 seconden (maximaal 20 seconden)
5. Zodra de nieuwe data binnenkomt, verschijnt de bijgewerkte timestamp

**Doorlooptijd:** 5–30 seconden afhankelijk van het aantal machines en de netwerksnelheid.

**Vereiste:** de agent moet draaien in continue modus. Als de agent niet draait
verschijnt de melding _"CNC agent niet bereikbaar"_.

---

## Hoe werkt de sync?

Voor elke CNC-machine die een IP-adres heeft in het MES:

1. Agent vraagt de machinelijst op bij de MES backend
2. Per machine roept de agent TNCcmd.exe aan:
   ```
   TNCcmd.exe -i <ip-adres> "GET TOOL.T C:\Temp\TOOL_<id>.T"
   ```
3. Het TOOL.T bestand wordt uitgelezen en geparseerd
4. De tools worden geüpload naar de MES backend
5. Het tijdelijke bestand wordt verwijderd
6. De MES backend slaat de tools op in de database en logt de sync

Machines die niet bereikbaar zijn (offline of verkeerd IP) worden overgeslagen.
De overige machines worden gewoon gesynchroniseerd.

---

## Probleemoplossing

| Fout | Oorzaak | Oplossing |
|------|---------|-----------|
| `TNCcmd.exe niet gevonden` | Verkeerd pad | Controleer `TNCCMD_PATH` in `.env` |
| `Inloggen mislukt` | Verkeerde inloggegevens | Controleer `ADMIN_USERNAME` en `ADMIN_PASSWORD`. Wachtwoorden met `#` moeten tussen dubbele aanhalingstekens staan: `"wacht#woord"` |
| `EADDRINUSE: port 3099` | Agent draait al | Er is al een instantie actief. Sluit die eerst, of wijzig `AGENT_PORT` in `.env` |
| `CNC agent niet bereikbaar` | Agent draait niet | Start de agent in continue modus: `node --env-file=.env cnc-agent.js` |
| Machine niet in dropdown | Geen IP ingesteld | Voeg een IP-adres toe via Admin > Machines in het MES |
| Machine offline | Netwerk/machine uit | Controleer of de machine aan staat en bereikbaar is op het netwerk |
