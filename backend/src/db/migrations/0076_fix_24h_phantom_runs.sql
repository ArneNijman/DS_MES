-- Runs met exact 86400 seconden (= 24 uur) zijn gesloten door de oude stale-checker
-- die na precies 24u afkapte en de run als 'interrupted' opsloog.
-- Een CNC-programma loopt nooit exact 24:00:00 — dit zijn phantom runs.
-- duration_seconds=0 sluit ze uit via de > 0 filter in project analyse.
UPDATE cnc_program_runs
SET
  duration_seconds = 0,
  status           = 'phantom'
WHERE status = 'interrupted'
  AND duration_seconds = 86400;
