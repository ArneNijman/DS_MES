import {
  pgTable,
  text,
  boolean,
  timestamp,
  serial,
  jsonb,
  uuid,
  unique,
  integer,
  numeric,
  doublePrecision,
} from 'drizzle-orm/pg-core'

export const employees = pgTable('employees', {
  id: uuid('id').primaryKey().defaultRandom(),
  bcId: text('bc_id').unique(),
  name: text('name').notNull(),
  email: text('email'),
  photoUrl: text('photo_url'),
  isClockedIn: boolean('is_clocked_in').default(false).notNull(),
  clockedInAt: timestamp('clocked_in_at', { withTimezone: true }),
  pinHash: text('pin_hash'),
  role: text('role').default('employee').notNull(),
  bcData: jsonb('bc_data'),
  syncedAt: timestamp('synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const bcConfig = pgTable('bc_config', {
  id: serial('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  clientId: text('client_id').notNull(),
  clientSecret: text('client_secret').notNull(),
  baseUrl: text('base_url').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  lastTestedAt: timestamp('last_tested_at', { withTimezone: true }),
  lastTestResult: jsonb('last_test_result'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const smtpSettings = pgTable('smtp_settings', {
  id: serial('id').primaryKey(),
  host: text('host').notNull(),
  port: text('port').notNull(),
  user: text('user').notNull(),
  password: text('password').notNull(),
  from: text('from').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const bcFieldMap = pgTable(
  'bc_field_map',
  {
    id: serial('id').primaryKey(),
    entityType: text('entity_type').notNull(),
    logicalField: text('logical_field').notNull(),
    detectedVariant: text('detected_variant').notNull(),
    exampleValue: text('example_value'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique('bc_field_map_entity_field_unique').on(t.entityType, t.logicalField)],
)

export const machines = pgTable('machines', {
  id: uuid('id').primaryKey().defaultRandom(),
  machineId: text('machine_id').unique(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  manufacturer: text('manufacturer'),
  model: text('model'),
  serialNumber: text('serial_number'),
  yearOfPurchase: integer('year_of_purchase'),
  weightKg: numeric('weight_kg', { precision: 10, scale: 2 }),
  isActive: boolean('is_active').default(true).notNull(),
  notes: text('notes'),
  photoUrl: text('photo_url'),
  // Elektrische aansluiting
  electricKva: numeric('electric_kva', { precision: 8, scale: 2 }),
  electricKw: numeric('electric_kw', { precision: 8, scale: 2 }),
  electricAmpere: numeric('electric_ampere', { precision: 8, scale: 2 }),
  electricFuse: text('electric_fuse'),
  electricCableLength: numeric('electric_cable_length', { precision: 8, scale: 2 }),
  electricWireDiameter: text('electric_wire_diameter'),
  // CNC configuratie
  cncController: text('cnc_controller'),
  cncIpAddress: text('cnc_ip_address'),
  cncCamName: text('cnc_cam_name'),
  cncMaxTools: integer('cnc_max_tools'),
  cncMaxLength: numeric('cnc_max_length', { precision: 10, scale: 2 }),
  cncMaxDiameter: numeric('cnc_max_diameter', { precision: 10, scale: 2 }),
  cncSpindleInterface: text('cnc_spindle_interface'),
  cncNcVersion: text('cnc_nc_version'),
  cncPlcVersion: text('cnc_plc_version'),
  toolTableFormat: text('tool_table_format'),  // null = 'heidenhain', 'fooke'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const maintenanceTasks = pgTable('maintenance_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  machineId: uuid('machine_id')
    .notNull()
    .references(() => machines.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').default('gepland').notNull(),
  priority: text('priority').default('normaal').notNull(),
  scheduledDate: text('scheduled_date'),
  completedDate: text('completed_date'),
  interval: text('interval'), // 'wekelijks' | 'maandelijks' | 'kwartaal' | 'halfjaar' | 'jaarlijks'
  assignedToId: uuid('assigned_to_id').references(() => employees.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const breakdowns = pgTable('breakdowns', {
  id: uuid('id').primaryKey().defaultRandom(),
  machineId: uuid('machine_id')
    .notNull()
    .references(() => machines.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').default('gemeld').notNull(),
  priority: text('priority').default('normaal').notNull(),
  reportedAt: timestamp('reported_at', { withTimezone: true }).defaultNow().notNull(),
  reportedById: uuid('reported_by_id').references(() => employees.id, { onDelete: 'set null' }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolution: text('resolution'),
  // Oplossing details
  resolvedByType: text('resolved_by_type'), // 'intern' | 'extern'
  resolvedByName: text('resolved_by_name'),
  werkbonUrl: text('werkbon_url'),
  werkbonFileName: text('werkbon_file_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const maintenanceLogs = pgTable('maintenance_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  maintenanceTaskId: uuid('maintenance_task_id')
    .notNull()
    .references(() => maintenanceTasks.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  registeredByName: text('registered_by_name').notNull(),
  registeredById: text('registered_by_id'),
  year: integer('year').notNull(),
  weekNumber: integer('week_number').notNull(),
  // Spindel uren
  spindleHours: numeric('spindle_hours', { precision: 10, scale: 2 }),
  // Las uren
  lasValueA: text('las_value_a'),
  lasValueB: text('las_value_b'),
  // Boolean velden
  bijgevuld: boolean('bijgevuld'),
  vervangen: boolean('vervangen'),
  afvoerGeleegd: boolean('afvoer_geleegd'),
  // Koelwater
  percentage: text('percentage'),
  // Meetdata
  fileUrl: text('file_url'),
  fileName: text('file_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const maintenanceAttachments = pgTable('maintenance_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  maintenanceTaskId: uuid('maintenance_task_id')
    .notNull()
    .references(() => maintenanceTasks.id, { onDelete: 'cascade' }),
  fileUrl: text('file_url').notNull(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const breakdownAttachments = pgTable('breakdown_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  breakdownId: uuid('breakdown_id')
    .notNull()
    .references(() => breakdowns.id, { onDelete: 'cascade' }),
  fileUrl: text('file_url').notNull(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const machineServiceVisits = pgTable('machine_service_visits', {
  id: uuid('id').primaryKey().defaultRandom(),
  machineId: uuid('machine_id')
    .notNull()
    .references(() => machines.id, { onDelete: 'cascade' }),
  visitDate: text('visit_date').notNull(),
  serviceType: text('service_type').notNull(), // 'intern' | 'extern'
  performedBy: text('performed_by').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const machineServiceContracts = pgTable('machine_service_contracts', {
  id: uuid('id').primaryKey().defaultRandom(),
  machineId: uuid('machine_id')
    .notNull()
    .references(() => machines.id, { onDelete: 'cascade' }),
  contractNumber: text('contract_number'),
  supplier: text('supplier').notNull(),
  startDate: text('start_date'),
  endDate: text('end_date'),
  costPerYear: numeric('cost_per_year', { precision: 10, scale: 2 }),
  description: text('description'),
  fileUrl: text('file_url'),
  fileName: text('file_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const machineDocuments = pgTable('machine_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  machineId: uuid('machine_id')
    .notNull()
    .references(() => machines.id, { onDelete: 'cascade' }),
  documentType: text('document_type').notNull(), // 'handleiding' | 'certificaat' | 'tekening' | 'schema' | 'overig'
  title: text('title').notNull(),
  fileUrl: text('file_url').notNull(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const machineInvoices = pgTable('machine_invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  machineId: uuid('machine_id')
    .notNull()
    .references(() => machines.id, { onDelete: 'cascade' }),
  fileUrl: text('file_url').notNull(),
  fileName: text('file_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const ncrRegistrations = pgTable('ncr_registrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  ncrId: text('ncr_id').unique().notNull(),
  productionOrder: text('production_order'),
  itemRef: text('item_ref'),
  itemName: text('item_name'),
  productionStep: text('production_step'),
  writtenByName: text('written_by_name'),   // auto-filled from logged-in user
  writtenByDepartment: text('written_by_department'),
  causingDepartment: text('causing_department'),
  faultCode: text('fault_code'),
  causeCode: text('cause_code'),
  shortDescription: text('short_description'),
  description: text('description'),
  measureRequired: boolean('measure_required'),
  peEmail: text('pe_email'),
  solution: text('solution'),
  dispositionType: text('disposition_type'),
  resolvedBy: text('resolved_by'),
  closedBy: text('closed_by'),
  closedAt: text('closed_at'),
  status: text('status').default('open').notNull(),
  createdById: uuid('created_by_id').references(() => employees.id, { onDelete: 'set null' }),
  assignedToId: uuid('assigned_to_id').references(() => employees.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type Employee = typeof employees.$inferSelect
export type NewEmployee = typeof employees.$inferInsert
export type AdminUser = typeof adminUsers.$inferSelect
export type BcConfig = typeof bcConfig.$inferSelect
export type BcFieldMap = typeof bcFieldMap.$inferSelect
export type Machine = typeof machines.$inferSelect
export type MaintenanceTask = typeof maintenanceTasks.$inferSelect
export type Breakdown = typeof breakdowns.$inferSelect
export type MaintenanceLog = typeof maintenanceLogs.$inferSelect
export type MaintenanceAttachment = typeof maintenanceAttachments.$inferSelect
export type BreakdownAttachment = typeof breakdownAttachments.$inferSelect
export type MachineServiceVisit = typeof machineServiceVisits.$inferSelect
export type MachineServiceContract = typeof machineServiceContracts.$inferSelect
export type MachineDocument = typeof machineDocuments.$inferSelect
export type MachineInvoice = typeof machineInvoices.$inferSelect
export const ncrAttachments = pgTable('ncr_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  ncrId: uuid('ncr_id').notNull().references(() => ncrRegistrations.id, { onDelete: 'cascade' }),
  fileUrl: text('file_url').notNull(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type NcrRegistration = typeof ncrRegistrations.$inferSelect
export type NcrAttachment = typeof ncrAttachments.$inferSelect

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'),
  priority: text('priority').notNull().default('laag'),        // kritisch | laag
  dueDate: text('due_date'),
  status: text('status').notNull().default('open'),            // open | in_uitvoering | gereed | gearchiveerd
  isFavorite: boolean('is_favorite').notNull().default(false),
  machineIds: jsonb('machine_ids').default([]).notNull(),         // uuid[] als JSON array
  createdById: uuid('created_by_id').references(() => employees.id, { onDelete: 'set null' }),
  assignedToId: uuid('assigned_to_id').references(() => employees.id, { onDelete: 'set null' }),
  assignedById: uuid('assigned_by_id').references(() => employees.id, { onDelete: 'set null' }),
  assignmentStatus: text('assignment_status'),                 // null | in_afwachting | geaccepteerd | afgewezen
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert

export const preventiveActions = pgTable('preventive_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  prevId: text('prev_id').unique().notNull(),
  ncrId: text('ncr_id'),                    // NCR_XXXXXX display-ID (optioneel)
  status: text('status').default('open').notNull(), // open | in_behandeling | gesloten
  assignedToId: uuid('assigned_to_id').references(() => employees.id, { onDelete: 'set null' }),
  assignedToName: text('assigned_to_name'), // denormalized voor snelle weergave
  datum: text('datum'),                     // datum ingevoerd (YYYY-MM-DD)
  completedAt: text('completed_at'),        // datum afgerond (YYYY-MM-DD)
  description: text('description'),
  resultaat: text('resultaat'),
  productionOrder: text('production_order'),
  itemRef: text('item_ref'),
  itemName: text('item_name'),
  createdByName: text('created_by_name'),   // denormalized naam aanmaker
  stilstandRegistreren: boolean('stilstand_registreren').default(false),
  createdById: uuid('created_by_id').references(() => employees.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type PreventiveAction = typeof preventiveActions.$inferSelect
export type NewPreventiveAction = typeof preventiveActions.$inferInsert

export const customerComplaints = pgTable('customer_complaints', {
  id: uuid('id').primaryKey().defaultRandom(),
  ctrId: text('ctr_id').unique().notNull(),               // CTR_10001, CTR_10002, …
  status: text('status').default('open').notNull(),        // open | in_behandeling | gesloten
  // Tab: Melding
  datumMelding: text('datum_melding'),
  datumAfgesloten: text('datum_afgesloten'),
  klant: text('klant'),
  oorspronkelijkOrdernummer: text('oorspronkelijk_ordernummer'),
  nieuwOrdernummer: text('nieuw_ordernummer'),
  contactpersoon: text('contactpersoon'),
  artikel: text('artikel'),
  emailContactpersoon: text('email_contactpersoon'),
  oorzaakCode: text('oorzaak_code'),
  foutCode: text('fout_code'),
  omschrijving: text('omschrijving'),
  // Tab: Oplossing
  oplossing:    text('oplossing'),
  beslotenDoor: jsonb('besloten_door').$type<{ id: string; name: string }[]>().default([]).notNull(),
  // Metadata
  createdByName: text('created_by_name'),
  createdById: uuid('created_by_id').references(() => employees.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type CustomerComplaint = typeof customerComplaints.$inferSelect
export type NewCustomerComplaint = typeof customerComplaints.$inferInsert

export const customerComplaintDocuments = pgTable('customer_complaint_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  ctrId: uuid('ctr_id').notNull().references(() => customerComplaints.id, { onDelete: 'cascade' }),
  documentNaam: text('document_naam'),
  fileUrl: text('file_url'),
  datum: text('datum'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type CustomerComplaintDocument = typeof customerComplaintDocuments.$inferSelect

export const measuringTools = pgTable('measuring_tools', {
  id: uuid('id').primaryKey().defaultRandom(),
  toolId: text('tool_id').unique().notNull(),              // MM-10001, MM-10002, …
  voorraadId: text('voorraad_id'),
  artikelnaam: text('artikelnaam'),
  merk: text('merk'),
  afmeting: text('afmeting'),
  kalibratiePlicht: boolean('kalibratie_plicht').default(false),
  interval: text('interval'),                              // 'jaarlijks'|'halfjaarlijks'|'kwartaal'|'geen'
  locatie: text('locatie'),
  emailTeamleider: text('email_teamleider'),
  teamleiderId: uuid('teamleider_id').references(() => employees.id, { onDelete: 'set null' }),
  gebruiktDoor: text('gebruikt_door'),
  machineId: uuid('machine_id').references(() => machines.id, { onDelete: 'set null' }),
  photoUrl: text('photo_url'),
  actief: boolean('actief').default(true),
  interneKalibratie: boolean('interne_kalibratie').default(false),
  externeKalibratie: boolean('externe_kalibratie').default(false),
  eindmaatKalibratie: boolean('eindmaat_kalibratie').default(false),
  ringKalibratie: boolean('ring_kalibratie').default(false),
  diepteKalibratie: boolean('diepte_kalibratie').default(false),
  afgekeurd: boolean('afgekeurd').default(false),
  afgekeurdReden: text('afgekeurd_reden'),
  serieSuffix: text('serie_suffix'),
  instructie: text('instructie'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type MeasuringTool = typeof measuringTools.$inferSelect
export type NewMeasuringTool = typeof measuringTools.$inferInsert

export const calibrationRecords = pgTable('calibration_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  toolId: uuid('tool_id').notNull().references(() => measuringTools.id, { onDelete: 'cascade' }),
  gekalibreerdDoor: text('gekalibreerd_door'),
  gekalibreerdDoorId: uuid('gekalibreerd_door_id').references(() => employees.id, { onDelete: 'set null' }),
  datum: text('datum'),
  type: text('type').default('extern'),
  certificaatUrl: text('certificaat_url'),
  certificaatNaam: text('certificaat_naam'),
  gecontroleerDoor:   text('gecontroleer_door'),
  gecontroleerDoorId: uuid('gecontroleer_door_id').references(() => employees.id, { onDelete: 'set null' }),
  datumWeggestuurd:   text('datum_weggestuurd'),
  datumTerug:         text('datum_terug'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type CalibrationRecord = typeof calibrationRecords.$inferSelect
export type NewCalibrationRecord = typeof calibrationRecords.$inferInsert

export const internalCalibrationSessions = pgTable('internal_calibration_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  toolId: uuid('tool_id').notNull().references(() => measuringTools.id, { onDelete: 'cascade' }),
  voltooiingsdatum:   text('voltooiingsdatum'),
  uitgevoerdDoor:     text('uitgevoerd_door'),
  uitgevoerdDoorId:   uuid('uitgevoerd_door_id').references(() => employees.id, { onDelete: 'set null' }),
  gecontroleerDoor:   text('gecontroleer_door'),
  gecontroleerDoorId: uuid('gecontroleer_door_id').references(() => employees.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type InternalCalibrationSession = typeof internalCalibrationSessions.$inferSelect

export const calibrationMeasurementRows = pgTable('calibration_measurement_rows', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId:     uuid('session_id').notNull().references(() => internalCalibrationSessions.id, { onDelete: 'cascade' }),
  calType:       text('cal_type').notNull(),   // 'eindmaat'|'diepte'|'ring'
  nomWaarde:     text('nom_waarde'),
  gemetenWaarde: text('gemeten_waarde'),
  tolerantie:    text('tolerantie'),
  datum:         text('datum'),
  dinNorm:       text('din_norm'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type CalibrationMeasurementRow = typeof calibrationMeasurementRows.$inferSelect

export const toolDocuments = pgTable('tool_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  toolId: uuid('tool_id').notNull().references(() => measuringTools.id, { onDelete: 'cascade' }),
  documentNaam: text('document_naam'),
  fileUrl: text('file_url'),
  datum: text('datum'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const cncToolEntries = pgTable('cnc_tool_entries', {
  id:         uuid('id').primaryKey().defaultRandom(),
  machineId:  uuid('machine_id').notNull().references(() => machines.id, { onDelete: 'cascade' }),
  toolNumber: integer('tool_number').notNull(),
  name:       text('name'),
  l:          numeric('l', { precision: 10, scale: 3 }),
  r:          numeric('r', { precision: 10, scale: 3 }),
  dl:         numeric('dl', { precision: 10, scale: 3 }),
  dr:         numeric('dr', { precision: 10, scale: 3 }),
  time2:      numeric('time2', { precision: 10, scale: 2 }),
  curTime:    numeric('cur_time', { precision: 10, scale: 2 }),
  doc:        text('doc'),
  locked:     boolean('locked').default(false),
  syncedAt:   timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt:  timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const cncSyncLogs = pgTable('cnc_sync_logs', {
  id:           uuid('id').primaryKey().defaultRandom(),
  machineId:    uuid('machine_id').notNull().references(() => machines.id, { onDelete: 'cascade' }),
  status:       text('status').notNull(), // 'running' | 'success' | 'error'
  toolsCount:   integer('tools_count'),
  durationMs:   integer('duration_ms'),
  errorMessage: text('error_message'),
  fileName:     text('file_name'),
  startedAt:    timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt:  timestamp('completed_at', { withTimezone: true }),
})

export type CncToolEntry = typeof cncToolEntries.$inferSelect
export type NewCncToolEntry = typeof cncToolEntries.$inferInsert
export type CncSyncLog = typeof cncSyncLogs.$inferSelect

export const productSetups = pgTable('product_setups', {
  id:                uuid('id').primaryKey().defaultRandom(),
  productionOrderNo: text('production_order_no'),
  articleNo:         text('article_no'),
  articleName:       text('article_name'),
  description:       text('description'),
  origin:            text('origin').notNull().default('manual'),
  setupType:         text('setup_type').notNull().default('product'),
  customer:          text('customer'),
  customerPo:        text('customer_po'),
  equipmentName:     text('equipment_name'),
  equipmentNumber:   text('equipment_number'),
  drawingNumber:     text('drawing_number'),
  rapportageInfo:    text('rapportage_info'),
  createdBy:         uuid('created_by').references(() => employees.id, { onDelete: 'set null' }),
  createdAt:         timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:         timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const productSetupSteps = pgTable('product_setup_steps', {
  id:              uuid('id').primaryKey().defaultRandom(),
  setupId:         uuid('setup_id').notNull().references(() => productSetups.id, { onDelete: 'cascade' }),
  stepNumber:      integer('step_number').notNull(),
  bewerkingNr:     integer('bewerking_nr'),
  stepName:        text('step_name').notNull(),
  machineId:       uuid('machine_id').references(() => machines.id, { onDelete: 'set null' }),
  zeroX:           text('zero_x'),
  zeroY:           text('zero_y'),
  zeroZ:           text('zero_z'),
  stepDescription: text('step_description'),
  opmerkingen:     text('opmerkingen'),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const productSetupNcFiles = pgTable('product_setup_nc_files', {
  id:            uuid('id').primaryKey().defaultRandom(),
  stepId:        uuid('step_id').notNull().references(() => productSetupSteps.id, { onDelete: 'cascade' }),
  fileName:      text('file_name').notNull(),
  programName:   text('program_name'),
  fileContent:   text('file_content').notNull(),
  toolCallCount: integer('tool_call_count').notNull().default(0),
  uploadedAt:    timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
})

export const productSetupToolCalls = pgTable('product_setup_tool_calls', {
  id:           uuid('id').primaryKey().defaultRandom(),
  ncFileId:     uuid('nc_file_id').notNull().references(() => productSetupNcFiles.id, { onDelete: 'cascade' }),
  sequence:     integer('sequence').notNull(),
  toolNumber:   integer('tool_number'),
  toolName:     text('tool_name'),
  axis:         text('axis'),
  spindleSpeed: integer('spindle_speed'),
  dl:           numeric('dl', { precision: 10, scale: 3 }),
  dr:           numeric('dr', { precision: 10, scale: 3 }),
})

export const productSetupDocuments = pgTable('product_setup_documents', {
  id:           uuid('id').primaryKey().defaultRandom(),
  setupId:      uuid('setup_id').notNull().references(() => productSetups.id, { onDelete: 'cascade' }),
  documentType: text('document_type').notNull(),
  fileUrl:      text('file_url').notNull(),
  fileName:     text('file_name').notNull(),
  versionNote:   text('version_note'),
  mimeType:      text('mime_type'),
  rapportageType: text('rapportage_type'),  // 'frezen' | 'controle' | 'eindmeting' | null
  uploadedBy:    uuid('uploaded_by').references(() => employees.id, { onDelete: 'set null' }),
  uploadedAt:    timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
})

export const productSetupAttachments = pgTable('product_setup_attachments', {
  id:        uuid('id').primaryKey().defaultRandom(),
  stepId:    uuid('step_id').notNull().references(() => productSetupSteps.id, { onDelete: 'cascade' }),
  fileUrl:   text('file_url').notNull(),
  fileName:  text('file_name').notNull(),
  caption:   text('caption'),
  mimeType:  text('mime_type'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type ProductSetup            = typeof productSetups.$inferSelect
export type NewProductSetup         = typeof productSetups.$inferInsert
export type ProductSetupStep        = typeof productSetupSteps.$inferSelect
export type NewProductSetupStep     = typeof productSetupSteps.$inferInsert
export type ProductSetupNcFile      = typeof productSetupNcFiles.$inferSelect
export type NewProductSetupNcFile   = typeof productSetupNcFiles.$inferInsert
export type ProductSetupToolCall    = typeof productSetupToolCalls.$inferSelect
export type NewProductSetupToolCall = typeof productSetupToolCalls.$inferInsert
export type ProductSetupDocument    = typeof productSetupDocuments.$inferSelect
export type NewProductSetupDocument = typeof productSetupDocuments.$inferInsert
export type ProductSetupAttachment  = typeof productSetupAttachments.$inferSelect
export type NewProductSetupAttachment = typeof productSetupAttachments.$inferInsert

export const statusLogs = pgTable('status_logs', {
  id:             uuid('id').primaryKey().defaultRandom(),
  entityType:     text('entity_type').notNull(),   // 'ncr' | 'preventief' | 'klantmelding'
  entityId:       uuid('entity_id').notNull(),
  fromStatus:     text('from_status'),
  toStatus:       text('to_status').notNull(),
  changedByName:  text('changed_by_name'),
  changedById:    uuid('changed_by_id').references(() => employees.id, { onDelete: 'set null' }),
  createdAt:      timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type StatusLog = typeof statusLogs.$inferSelect

export type ToolDocument = typeof toolDocuments.$inferSelect
export type NewToolDocument = typeof toolDocuments.$inferInsert

// ── Tool Library (geïmporteerd uit TDM / WinTool SQLite) ──────────────────────

export const toolLibraryItems = pgTable('tool_library_items', {
  id:            uuid('id').primaryKey().defaultRandom(),
  sourceId:      integer('source_id').notNull(),
  itemType:      text('item_type').notNull(),      // 'holder' | 'tool' | 'extension' | 'head'
  itemCategory:  text('item_category'),            // GeometryClasses.name voor tools
  name:          text('name').notNull(),
  comment:       text('comment'),
  orderingCode:  text('ordering_code'),
  manufacturer:  text('manufacturer'),
  photoUrl:            text('photo_url'),
  wisselplaatPhotoUrl: text('wisselplaat_photo_url'),
  schroefOrderingCode: text('schroef_ordering_code'),
  schroefPhotoUrl:     text('schroef_photo_url'),
  importedAt:    timestamp('imported_at', { withTimezone: true }).defaultNow().notNull(),
})

export const toolLibraryAssemblies = pgTable('tool_library_assemblies', {
  id:             uuid('id').primaryKey().defaultRandom(),
  ncNumber:       integer('nc_number').notNull(),
  ncName:         text('nc_name').notNull(),
  comment:        text('comment'),
  toolLength:     doublePrecision('tool_length'),
  presetDiameter: doublePrecision('preset_diameter'),
  toolItemId:     uuid('tool_item_id').references(() => toolLibraryItems.id),
  holderItemId:   uuid('holder_item_id').references(() => toolLibraryItems.id),
  importedAt:     timestamp('imported_at', { withTimezone: true }).defaultNow().notNull(),
})

export const toolLibraryAssemblyComponents = pgTable('tool_library_assembly_components', {
  id:         uuid('id').primaryKey().defaultRandom(),
  assemblyId: uuid('assembly_id').notNull().references(() => toolLibraryAssemblies.id, { onDelete: 'cascade' }),
  itemId:     uuid('item_id').notNull().references(() => toolLibraryItems.id),
  position:   integer('position').notNull(),
  reach:      doublePrecision('reach'),
})

export type ToolLibraryItem             = typeof toolLibraryItems.$inferSelect
export type ToolLibraryAssembly         = typeof toolLibraryAssemblies.$inferSelect
export type ToolLibraryAssemblyComponent = typeof toolLibraryAssemblyComponents.$inferSelect

// ── App settings (key-value) ─────────────────────────────────────────────────

export const appSettings = pgTable('app_settings', {
  key:   text('key').primaryKey(),
  value: text('value').notNull(),
})

// ── Tooling Beheer (kiosk module) ────────────────────────────────────────────

export const toolingArticles = pgTable('tooling_articles', {
  id:           uuid('id').primaryKey().defaultRandom(),
  articleType:  text('article_type').notNull(),
  name:         text('name').notNull(),
  orderingCode: text('ordering_code'),
  manufacturer: text('manufacturer'),
  photoUrl:     text('photo_url'),
  sourceItemId: uuid('source_item_id').references(() => toolLibraryItems.id, { onDelete: 'set null' }),
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const toolingStockLocations = pgTable('tooling_stock_locations', {
  id:           uuid('id').primaryKey().defaultRandom(),
  articleId:    uuid('article_id').notNull().references(() => toolingArticles.id, { onDelete: 'cascade' }),
  locationCode: text('location_code').notNull(),
  quantity:     integer('quantity').notNull().default(0),
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const toolingMutations = pgTable('tooling_mutations', {
  id:            uuid('id').primaryKey().defaultRandom(),
  articleId:     uuid('article_id').notNull().references(() => toolingArticles.id, { onDelete: 'cascade' }),
  employeeId:    uuid('employee_id').references(() => employees.id, { onDelete: 'set null' }),
  locationCode:  text('location_code').notNull(),
  quantityDelta: integer('quantity_delta').notNull(),
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const toolingFavorites = pgTable('tooling_favorites', {
  id:         uuid('id').primaryKey().defaultRandom(),
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  articleId:  uuid('article_id').notNull().references(() => toolingArticles.id, { onDelete: 'cascade' }),
})

export type ToolingArticle       = typeof toolingArticles.$inferSelect
export type ToolingStockLocation = typeof toolingStockLocations.$inferSelect
export type ToolingMutation      = typeof toolingMutations.$inferSelect

export const productSetupOverdracht = pgTable('product_setup_overdracht', {
  id:            uuid('id').primaryKey().defaultRandom(),
  stepId:        uuid('step_id').notNull().references(() => productSetupSteps.id, { onDelete: 'cascade' }),
  tekst:         text('tekst').notNull(),
  createdBy:     uuid('created_by').references(() => employees.id, { onDelete: 'set null' }),
  createdByName: text('created_by_name'),
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const productSetupOverdrachtPhotos = pgTable('product_setup_overdracht_photos', {
  id:           uuid('id').primaryKey().defaultRandom(),
  overdrachtId: uuid('overdracht_id').notNull().references(() => productSetupOverdracht.id, { onDelete: 'cascade' }),
  fileUrl:      text('file_url').notNull(),
  fileName:     text('file_name').notNull(),
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
