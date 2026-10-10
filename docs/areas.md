# Areas — one official name per place

The modules and the platform equipment list use many names for the same
place: `CM1`, `CementMill1` and `Cement Mill 1`, or `RM#1`, `RM1` and
`RawMill1`. **Settings → Equipment & IDs → Areas** keeps one official list.
Every page then shows the official name: Plant overview, Equipment, the
area filters, "Open actions by area", and the area suggestions in the
equipment form. The sheets themselves are not renamed.

## The list

Each area belongs to a line:

| Line | Areas (other names they stand for) |
|---|---|
| Line 1 | Crusher (RMCrusher) · Raw Mill 1 (RawMill1, RM#1, RM1) · Kiln 1 (Kiln1, Kiln#1) · Coal Mill 1 (CoalMill1, Coal M#1) · Hot Disc (HotDisc) |
| Line 2 | Raw Mill 2 · Kiln 2 · Coal Mill 2 (same patterns) · AFR (AFShredding) |
| Cement Mills 1 (CM1, CM#1) | Cement Mill 1 · Cement Mill 2 · Clinker Area 1 · Gypsum Conveying (Gypsum Conv) · Packing 1 (PackingArea1) |
| Cement Mills 2 (CM2, CM#2) | Cement Mill 3 · Cement Mill 4 · Clinker Area 2 · Gypsum Crusher (GyCrusher) · Packing 2 (PackingArea2) |
| Common | Hydrogen Plant (Hydrogen) |

This is the **proposed** list, shown until the App Owner saves. Some names
are left for you to place: the Oil names `AF#1`, `AF#2`, `Coal Meal`,
`Raw Meal`, `Gypsum` and `CM L2`. They show under **Names in use → Not in
the list**.

## Using the page (App Owner; others can only view)

1. **Names in use** lists every name found in the platform list, Oil and
   Vibration, with how many machines use it. For each name, pick the
   official name it shows as:
   - an area;
   - a whole line, when only the line is known (for example Vibration's
     `Line1`);
   - "as it is", which leaves it alone.
2. **Official list**: rename, add or remove lines and areas. The other
   names each one stands for show as tags.
3. **Save** writes the list. It is logged in Activity.

Matching ignores case, spaces, `#`, `.`, `-` and `_`, so `Kiln #1`,
`Kiln#1` and `kiln1` are the same name.

The area filter offers "All of Line 1" (every machine on the line) and each
area of the line. Names not in the list yet are grouped at the end.

## Code

- Platform Core `Areas.js`:
  - `getAreas` (anyone signed in) and `saveAreas` (App Owner).
  - The sheet `AREAS`: Kind | Name | Line | Aliases | Order, made on the
    first save.
- Frontend:
  - `areas.ts`: `useAreas`, `areaResolver`, `areaKey`.
  - `pages/plantShared.tsx`: machines carry `area` (official) and `line`,
    plus `AreaSelect` and `areaMatch`.
  - `components/AreasTab.tsx`: the Areas page.
