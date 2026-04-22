# Installeert de CNC Agent als Windows Taakplanner taak
# Uitvoeren als Administrator: Right-click > Run as administrator
#
# De agent draait continu (geen --once):
#   - Synct automatisch elke 30 minuten
#   - HTTP server op poort 3099 blijft actief voor de Sync-knop in de kiosk

$AgentDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$NodeExe   = (Get-Command node).Source
$ScriptPath = Join-Path $AgentDir "cnc-agent.js"
$EnvFile   = Join-Path $AgentDir ".env"
$TaskName  = "DutchShape-CNC-Agent"

if (-not (Test-Path $EnvFile)) {
    Write-Error ".env bestand niet gevonden in $AgentDir. Maak eerst .env aan."
    exit 1
}

# Geen --once: agent blijft draaien, regelt zelf het interval en de HTTP server
$Action = New-ScheduledTaskAction `
    -Execute $NodeExe `
    -Argument "--env-file=`"$EnvFile`" `"$ScriptPath`"" `
    -WorkingDirectory $AgentDir

# Starten bij inloggen (blijft dan actief)
$Trigger = New-ScheduledTaskTrigger -AtLogOn

$Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -RunOnlyIfNetworkAvailable `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 2)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -RunLevel Highest `
    -Force

Write-Host ""
Write-Host "Taak '$TaskName' geinstalleerd - start bij inloggen, draait continu"
Write-Host "Sync interval: elke 30 minuten (ingesteld in .env)"
Write-Host "HTTP trigger: poort 3099"
Write-Host "Beheer via: Taakplanner > $TaskName"
