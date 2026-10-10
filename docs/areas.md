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
| Line 1 | Crusher (RMCrusher) · Raw Mill 1 (RawMill1, RM#1, RM1, Raw Meal) · Kiln 1 (Kiln1, Kiln#1) · Coal Mill 1 (CoalMill1, Coal M#1, Coal Meal) · Hot Disc (HotDisc, AF#1) |
| Line 2 | Raw Mill 2 (Raw Meal) · Kiln 2 · Coal Mill 2 (same patterns) · AFR (AFShredding, AF#2) |
| Cement Mills 1 (CM1, CM#1) | Cement Mill 1 · Cement Mill 2 · Clinker Area 1 · Gypsum Conveying (Gypsum Conv, Gypsum) · Packing 1 (PackingArea1) |
| Cement Mills 2 (CM2, CM#2, CM L2) | Cement Mill 3 · Cement Mill 4 · Clinker Area 2 · Gypsum Crusher (GyCrusher, Gypsum) · Packing 2 (PackingArea2) |
| Common | Hydrogen Plant (Hydrogen) |

This is the **proposed** list, shown until the App Owner saves.

### One name on two lines

`Raw Meal` is on Line 1 and Line 2, and `Gypsum` is in both cement mill
areas. An other name may stand for one area per line; each machine is
then placed by its own line. In order:

1. A machine on the **platform equipment list** takes its place from there
   (Plant_Area / Main_Area of its Equipment ID), whatever a module calls it.
2. Otherwise its name is looked up in the list. For a name on two lines,
   the line the other module gives the same machine decides.
3. If neither decides, the name shows as it is, under "Names in use".

### Every module

The same names and filters are used everywhere: Plant overview and
Equipment, Oil Lubrication (all pages and the route lists) and Vibration
(measurement tracker and dashboard). The modules get the list from the
platform when they open (`officialAreas.js`).

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
