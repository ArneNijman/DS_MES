@echo off
echo Switching to TEST SERVER mode (productie-build, poort 8080)...

REM Firewall regel toevoegen (vereist administrator rechten)
netsh advfirewall firewall show rule name="MES Testserver" >nul 2>&1
if errorlevel 1 (
    echo Firewall regel aanmaken voor poort 8080...
    netsh advfirewall firewall add rule name="MES Testserver" dir=in action=allow protocol=TCP localport=8080
)
docker compose down
docker compose -f docker-compose.yml up -d --build
echo.

REM Haal het lokale IP op
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    set IP=%%a
    goto :found
)
:found
set IP=%IP: =%

echo Testserver draait op:
echo   Lokaal:     http://localhost:8080
echo   Netwerk:    http://%IP%:8080
