-- Runs afgesloten door migration 0074 stap 2 hebben duration_seconds=1 als sentinelwaarde
-- (geen bijpassend MACHINE_OFFLINE event gevonden). Dit zijn phantom runs die niet in
-- project analyse metrics mogen tellen. duration_seconds=0 sluit ze uit via de > 0 filter.
UPDATE cnc_program_runs
SET
  duration_seconds = 0,
  status           = 'phantom'
WHERE status = 'interrupted'
  AND duration_seconds = 1;
