# Features

What each app in this folder does. For how to start them, see [RUNNING.md](RUNNING.md).

## Fieldwise (our app)

Runs at http://127.0.0.1:5180. All satellite and weather data is simulated for now; `fieldwise/README.md` explains how to plug in real Sentinel-2 data.

### Satellite analysis (the core)

- **3D field view.** The field sits on a slab of real satellite imagery floating in space. Drag to rotate, scroll to zoom, or switch to a flat 2D view.
- **10 m pixel zones.** Each satellite pixel is coloured by how urgent it is: no concern, watch, act soon or act now. Problem areas stand out at a glance.
- **"Scout here first" hotspot.** A glowing outline marks the worst patch. Its detail card shows the area, its share of the field and how sure we are. For pests, it also lists likely threats for the crop with their chances.
- **Six layers.** Crop health, water, nutrients, pest risk, soil carbon and yield. Each has its own animated scene:

  | Layer | Scene |
  |-------|-------|
  | Pest risk | Moths over the hotspot, beetles crawling along the boundary |
  | Soil | Soil probes with LOW/OK screens |
  | Water | Moisture probes, falling water drops and ripples |
  | Nutrients | Nitrogen probes and falling fertilizer pellets |
  | Crop health | A scouting drone over the weak patch |
  | Yield | Harvest crates in the strongest zones |

- **Farm advisory panel.** A 0–100 field score, findings ranked by priority with plain advice, a yield estimate and a countdown to the next satellite image.
- **Image history.** Pick any image from the last 60 days (cloudy ones are greyed out), compare before and after, and see season trend charts.
- **Map view.** A regular 3D map with terrain, as an alternative to the field view.

### 3D satellite animations

- A splash screen with a satellite orbiting a real-imagery Earth.
- A transition when switching fields: the globe turns so the satellite's beam lands on your field.
- A satellite fly-over across the map.
- A "fetching history" scene while a new field is being set up.

### Other pages

- **Field mapping wizard.** Tap the corners, draw a circle, or upload a KML, KMZ or GeoJSON file. It shows live area and perimeter, then asks for field details and a plan.
- **Analytics.** Every field's trend over the season, plus a comparison table across all layers.
- **Reports.** A one-page field report you can print or save as a PDF.
- **Weather.** A 7-day forecast with spray windows, crop water use and the water balance.

### Operations (add-on)

- **Tasks.** Turn alerts or hotspots into tasks for a person or a crew. Tasks go from Pending to In progress to Done, and turn Delayed automatically once overdue. Board and table views.
- **My tasks.** A phone-style view for field staff, with Start and Done buttons and notes to report back.
- **Performance.** Completion and on-time rates per crew and per person.
- **Team & roles.** Owner, admin, manager and field staff, each with their own permissions. Add people by email or phone.

## AgroLens (re-skinned Farmonaut copy)

Runs at http://localhost:5173.

Everything in Farmonaut's own web app, with your name, logo and colour applied: field mapping, the 3D field view, advisories, spray-window countdowns, analytics, reports and weather. Change the branding in `sat-local/brand.json`.

> **Important:** AgroLens runs on Farmonaut's servers. Treat it as a reference to compare against, not as your product, and keep it local.
