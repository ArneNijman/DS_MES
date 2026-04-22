@echo off
echo Switching to DEV mode (hot reload, poort 5173)...
docker compose down
docker compose up -d --build
echo.
echo Dev server draait op http://localhost:5173
