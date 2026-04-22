@echo off
:: CNC Agent — eenmalige sync
:: Dubbelklik om handmatig te syncen, of gebruik taakplanner voor automatisch

cd /d "%~dp0"

if not exist ".env" (
    echo FOUT: .env bestand niet gevonden.
    echo Kopieer .env.example naar .env en vul de gegevens in.
    pause
    exit /b 1
)

echo Starten CNC Agent (eenmalige sync)...
node --env-file=.env cnc-agent.js --once

echo.
echo Klaar. Druk op een toets om te sluiten.
pause
