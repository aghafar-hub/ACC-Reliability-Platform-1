export const HOWTO_TOPICS = [
  {
    id: "overview",
    icon: "ti-layout-dashboard",
    title: "App Overview",
    color: "#4A90D9",
    steps: [
      {
        title: "What is this app?",
        desc: "The Arabian Cement Oil Analysis Management app connects directly to your Google Sheet. All data you see comes from the sheet in real time — no separate database needed.",
      },
      {
        title: "Sidebar Navigation",
        desc: "Use the left sidebar to switch between pages. On mobile, tap the ☰ menu button in the top-left to open the sidebar. The sync status dot at the bottom shows your connection state.",
      },
      {
        title: "Sync — Full vs Quick",
        desc: "Full Sync re-reads every sheet tab (samples, actions, oil changes). Quick Sync ⚡ only fetches records changed since your last sync — much faster for daily use. Always do a Full Sync after making bulk changes directly in the sheet.",
      },
    ],
  },
  {
    id: "dashboard",
    icon: "ti-layout-dashboard",
    title: "Dashboard",
    color: "#2DC653",
    steps: [
      {
        title: "Status Summary Cards",
        desc: "The top cards show a count of Alert, Caution, and Normal equipment based on the most recent sample per equipment. Click any card to filter the table below to that status only.",
      },
      {
        title: "Area Filter",
        desc: "Use the Kiln / Cement area buttons at the top to filter the entire dashboard to one area. This affects all counts and the equipment table below.",
      },
    ],
  },
  {
    id: "equipment",
    icon: "ti-database",
    title: "Equipment & Samples",
    color: "#9B59B6",
    steps: [
      {
        title: "Equipment Registry Tab",
        desc: "Shows all registered equipment with their latest sample status badge. Click any equipment card to expand it and see detailed equipment info (Asset Class, Lubricant, Manufacturer, Model) and all historical samples.",
      },
      {
        title: "Viewing a Sample Report",
        desc: "Inside each expanded equipment card, click the 📊 Report button on any sample row to open the full Oil Analysis Report for that sample — showing all parameters, trend charts, and wear analysis.",
      },
      {
        title: "Adding a New Sample",
        desc: "Go to Add Sample (upload icon in sidebar). Select the Equipment Code — Asset Class, Lubricant, Manufacturer, and Model will auto-fill from the registry. Enter Sample Date using the calendar picker, fill in the analysis values, then click Save.",
      },
    ],
  },
  {
    id: "actions",
    icon: "ti-checklist",
    title: "Action Tracker",
    color: "#E63946",
    steps: [
      {
        title: "Understanding the View",
        desc: "By default, you see ONE chip per equipment showing its most recent action. Click any chip to expand it and see all actions for that equipment, newest first. Click any action row inside to see its full details popup.",
      },
      {
        title: "Adding an Action",
        desc: "Click 'Add Action'. Select equipment — Description and Oil Type auto-fill. Sample Date shows a dropdown of actual sample dates for that equipment. Selecting a date auto-fills Sample Result. Last Change date (if entered) will update the Oil Change Log automatically.",
      },
      {
        title: "Filtering Actions",
        desc: "Click the status count chips (Open / In Progress / Waiting Stoppage / Closed) to filter. Use the Equipment dropdown to show one equipment only. Month and Year filters show actions by their Revision Date. All filters work together.",
      },
    ],
  },
  {
    id: "oilchange",
    icon: "ti-droplet",
    title: "Oil Change Log",
    color: "#F4A261",
    steps: [
      {
        title: "What you can and cannot edit",
        desc: "Equipment rows in the Oil Change Log can NOT be added or deleted from the app — manage them directly in Google Sheets. You can only edit Last Change Date and Next Oil Change Date. Status (Good/Overdue) is calculated automatically.",
      },
      {
        title: "Editing Dates",
        desc: "Click 'Edit Dates' on any lubrication point row. Enter the Last Change Date — the Next Oil Change Date will be calculated automatically based on the frequency (e.g. '0.5 Y' = 6 months, 'Oil Analysis' = 3 years). Status updates to Good or Overdue instantly.",
      },
    ],
  },
  {
    id: "tracker",
    icon: "ti-activity",
    title: "Oil Sample Tracker",
    color: "#2DC653",
    steps: [
      {
        title: "Status Alarms",
        desc: "Each equipment shows one of three statuses based on its sampling interval (from Equipment Registry) and the date of its last sample: OK (within interval, plus a half-month grace), OVERDUE (up to 1.5 months past that grace), MISSING (more than 2 months past due — red alarm).",
      },
      {
        title: "Monthly Timeline",
        desc: "Click any equipment card to expand its sample history — shown as monthly columns (Apr 2026, Mar 2026...) with the oil analysis status (Normal/Caution/Alert) for that month. Hover over a card to see the exact sample date.",
      },
    ],
  },
  {
    id: "report",
    icon: "ti-chart-line",
    title: "Oil Analysis Report",
    color: "#4A90D9",
    steps: [
      {
        title: "Selecting Equipment",
        desc: "Use the Equipment Code dropdown to select which equipment to view. The report shows all samples for that equipment in columns, newest on the right. Use the Area filter buttons to narrow down the equipment list.",
      },
      {
        title: "Reading the Report",
        desc: "Left side shows all parameters in a table — Sample Info, Lubricant ratings, TAN, Viscosity, Wear metals, Contaminants, Additives. Right side shows trend charts: Viscosity, Wear, Contaminants, and Physical Properties (TAN + Water).",
      },
    ],
  },
  {
    id: "settings",
    icon: "ti-settings",
    title: "Settings",
    color: "#6B8CAE",
    steps: [
      {
        title: "Appearance Tab",
        desc: "Select from 10 colour themes — Dark Navy, Light, Desert, Forest, and more. Changes apply instantly with no save needed. No password required.",
      },
      {
        title: "Configuration Tab (Password Protected)",
        desc: "Password: 17593. Contains: Sheet URL, Apps Script Webhook URL, Cache & Auto-sync settings, Logo URL, Equipment Registry sync, Export/Import/Reset configuration. Password is required every time you open this tab.",
      },
      {
        title: "Syncing Equipment Registry",
        desc: "In Configuration, click 'Sync Equipment Registry' to pull the latest equipment list from your 'Equipment Registry' sheet tab. If any equipment exists in the app but not the sheet, you'll be shown a list to Keep or Remove each one before applying.",
      },
    ],
  },
];
