# Module settings (Settings → Oil Lubrication / Vibration Analysis)

Both modules use the same five cards. Each card saves on its own, shows
**Last changed by**, and every change is written to the module's audit tab
(Oil: `Audit Log`, Vibration: `Vibration Audit`) for the Activity page.

| Card | Oil Lubrication | Vibration Analysis |
|---|---|---|
| Status | backend, platform equipment list, last ID check, version · Test connection · Details (address, sheet link, Sync now) | same |
| Intervals | sampling and oil change interval per Lub ID (Equipment Registry columns P/Q; same text format as before: months `6`, `2 Y`, `Monthly`, `If needed`, `As needed`) · search · Set for all shown | default measuring interval (30), grace before Overdue (7), report due (45) days, dashboard "Not read" after (6) months · RMS / SPM limits most machines use · machines with own limits · link to Limits & intervals |
| Lists | action phrases (`OL_ACTION_PHRASES`) | action phrases (`VA_ACTION_PHRASES`, new) — offered as tap-to-add on an action's text boxes |
| Targets | routes, samples, actions closed in time (%) — routes and samples on the Oil dashboard | machines measured, reports in time, actions closed in time (%) — measured on the Vibration dashboard |
| Notifications | link to Settings → Email & notifications (App Owner), status of the platform switch | same |
| This device | auto-sync, clear saved data (unsent changes are kept) | clear saved data |

**Who:** Settings → Settings access, page "Oil Lubrication settings" /
"Vibration Analysis settings". *Edit · responsible* = the module's ACC
responsible engineer can change it; others with the role see it read-only.
A module's settings are only listed for people who can open that module.

Stored in Script Properties: `MS_CHANGED_<card>` (last change),
`DASH_ON_TIME_TARGET` / `DASH_SAMPLES_TARGET` / `DASH_ACTIONS_TARGET` (Oil),
`VS_DEFAULT_INTERVAL` / `VS_GRACE_DAYS` / `VS_REPORT_DUE_DAYS` and
`VS_TARGET_*` (Vibration).

Actions targets are stored now and used by the Team page (next step).
