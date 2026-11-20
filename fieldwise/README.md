# Fieldwise

Satellite crop analysis for farms, with an optional field-operations add-on.
This is an original app. Its features were modelled on what we learned by reverse-engineering
Farmonaut's public web app (see `../analysis/REPORT.md`).

## Run it

```bash
npm install
npm run dev        # http://127.0.0.1:5180
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/
```

No accounts or API keys are needed. All data is a seeded demo kept in `localStorage`.
"Reset demo data" in the user menu restores it.

## What's in it

**Analysis (the core product)**
- **3D map** (MapLibre): Esri imagery over real terrain elevation, with a sky and horizon. Index
  cells are drawn as 3D columns whose height and colour show the value. You can switch to 2D, fly
  to zones, and click a field to select it.
- **Six layers**: crop health (NDVI), water (NDMI), nutrients, pest risk, soil carbon and yield potential.
  Health and yield are judged against the crop's expected growth stage, so a freshly sown field
  isn't flagged as stressed.
- **Farm advisory**: a 0–100 field score, findings ranked by priority with plain-language advice,
  a yield estimate, a live countdown to the next satellite pass, and weather with spray windows.
- **Image timeline**: choose any pass from the last 60 days (cloudy passes are disabled),
  compare before and after, and view a season trend chart for each layer.
- **Analytics**: compares every field over the season. **Reports**: a printable field report.
  **Weather**: a 7-day outlook with Hargreaves ET₀ and the water balance.

**3D satellite scenes** (Three.js, procedural model with no assets)
- A splash screen on first load: an orbiting satellite over a real-imagery Earth, with an atmosphere glow.
- A transition between sections and when switching fields. The globe turns so the field sits
  under the satellite's scan beam.
- A scan fly-over across the map whenever the field, layer or image changes.
- A processing scene while a new field's satellite history is being "fetched".

**Field mapping wizard**: tap points, draw a 64-point circle (with radius presets and a drag
handle), or upload KML, KMZ or GeoJSON. Shows live area, perimeter and point count, then a
details form with a required-field counter, then plan selection.

**Operations add-on**: alerts become tasks assigned to a person or a crew. Tasks move from
Pending to In progress to Done, and become Delayed automatically once past due. Also: board and
table views, an activity log, a phone-style view for field staff, per-crew and per-person
performance, and team roles (owner, admin, manager, field staff). Members are added by email
*or* phone. Use the user menu to view the app as any member.

## Where things live

| Path | What it does |
|------|--------------|
| `src/lib/sat.ts` | Simulated satellite pipeline: passes, index grids, hotspots, zones, alerts |
| `src/lib/advisory.ts` | Findings, field score, yield estimate |
| `src/lib/weather.ts` | Forecast and Hargreaves ET₀ |
| `src/components/Map3D.tsx` | MapLibre 3D map |
| `src/three/` | Satellite model, orbital scene, scan overlay |
| `src/fx/Fx.tsx` | Splash and transitions |
| `src/store/` | Zustand store (stands in for a backend) and demo seed |

## Replacing the simulation

The rest of the app only uses the functions exported from `src/lib/sat.ts` and
`src/lib/weather.ts`. To go live, back them with Sentinel-2 indices (Sentinel Hub or
Google Earth Engine) and a weather API, and move the store to a real backend.
