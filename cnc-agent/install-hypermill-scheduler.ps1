# Installeert de HyperMill Agent als Windows Taakplanner taak
# Uitvoeren als Administrator via PowerShell:
#   powershell -ExecutionPolicy Bypass -File install-hypermill-scheduler.ps1
#
# De agent start automatisch bij inloggen en luistert op poort 3098.
# Geen .env nodig — geen configuratie vereist.

$AgentDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$NodeExe    = (Get-Command node).Source
$ScriptPath = Join-Path $AgentDir "hypermill-agent.js"
$TaskName   = "DutchShape-HyperMill-Agent"

$Action = New-ScheduledTaskAction `
    -Execute $NodeExe `
    -Argument "`"$ScriptPath`"" `
    -WorkingDirectory $AgentDir

$TriggerBoot  = New-ScheduledTaskTrigger -AtStartup
$TriggerLogon = New-ScheduledTaskTrigger -AtLogOn
$Trigger = @($TriggerBoot, $TriggerLogon)

$Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
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
Write-Host "Taak '$TaskName' geinstalleerd - start automatisch bij inloggen"
Write-Host "HyperMill agent luistert op poort 3098"
Write-Host "Beheer via: Taakplanner > $TaskName"
