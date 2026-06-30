-- Sluit open runs af die een MACHINE_OFFLINE event hebben na de startdatum.
-- Dit herstelt runs die vóór de MACHINE_OFFLINE fix (2026-06-25) nooit zijn afgesloten.
UPDATE cnc_program_runs pr
SET
  ended_at         = sub.offline_at,
  duration_seconds = EXTRACT(EPOCH FROM (sub.offline_at - pr.started_at))::int,
  status           = 'interrupted'
FROM (
  SELECT
    pr2.id,
    MIN(e.occurred_at) AS offline_at
  FROM cnc_program_runs pr2
  JOIN cnc_machine_events e
    ON e.machine_id = pr2.machine_id
   AND e.event_type = 'MACHINE_OFFLINE'
   AND e.occurred_at > pr2.started_at
  WHERE pr2.ended_at IS NULL
  GROUP BY pr2.id
) sub
WHERE pr.id = sub.id;

-- Sluit eventuele resterende open runs af zonder bijpassend MACHINE_OFFLINE event
-- (ouder dan 24 uur — nooit een actief programma).
UPDATE cnc_program_runs
SET
  ended_at         = started_at + INTERVAL '1 second',
  duration_seconds = 1,
  status           = 'interrupted'
WHERE ended_at IS NULL
  AND started_at < NOW() - INTERVAL '24 hours';
