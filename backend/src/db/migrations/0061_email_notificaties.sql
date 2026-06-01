-- SMTP instellingen uitbreiden
ALTER TABLE smtp_settings
  ADD COLUMN IF NOT EXISTS from_name         text NOT NULL DEFAULT 'Dutch Shape MES',
  ADD COLUMN IF NOT EXISTS reminder_interval text NOT NULL DEFAULT 'dagelijks';

-- Zorg dat er altijd één rij bestaat met standaardinstellingen
INSERT INTO smtp_settings (id, host, port, "user", password, "from", from_name, reminder_interval)
VALUES (1, 'dutchshape-nl01c.mail.protection.outlook.com', '25', '', '', 'mes@dutch-shape.nl', 'Dutch Shape MES', 'dagelijks')
ON CONFLICT (id) DO NOTHING;

-- Medewerkers: opt-out voor email notificaties
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS email_notificaties boolean NOT NULL DEFAULT true;
