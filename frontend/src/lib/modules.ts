export const SIDEBAR_MODULES = [
  { key: 'mijn_taken',       label: 'Mijn taken'              },
  { key: 'mijn_meldingen',   label: 'Mijn meldingen'          },
  { key: 'ncr',              label: 'NCR registratie'         },
  { key: 'preventief',       label: 'Preventieve maatregelen' },
  { key: 'klantmelding',     label: 'Klantmeldingen'          },
  { key: 'ncr_statistieken', label: 'NCR Statistieken'        },
  { key: 'machines',         label: 'Machines'                },
  { key: 'machine_dashboard', label: 'Machine Dashboard'       },
  { key: 'meetmiddelen',     label: 'Meetmiddelen'            },
  { key: 'cnc_machining',    label: 'CNC Machining'           },
  { key: 'tooling',          label: 'Tooling beheer'          },
  { key: 'product_setup',    label: 'Product Setup'           },
  { key: 'meet_setup',       label: 'Meet Setup'              },
  { key: 'setup_archief',    label: 'Setup Archief'           },
] as const

export type ModuleKey = typeof SIDEBAR_MODULES[number]['key']
