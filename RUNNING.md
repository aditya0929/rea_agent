# How to run everything in this folder

There are two apps you can run side by side, plus the REA reverse-engineering tool. For what each app does, see [FEATURES.md](FEATURES.md).

| What | Folder | Address |
|------|--------|---------|
| **Fieldwise**: our own satellite farm app | `fieldwise/` | http://127.0.0.1:5180 |
| **AgroLens**: local re-skin of the Farmonaut web app | `sat-local/` | http://localhost:5173 |
| **REA**: the reverse-engineering CLI | `rea-tool/` | command line only |

> **In the GitHub repo:** only Fieldwise, the helper scripts and these docs are included. `sat-local/` (AgroLens), `analysis/` and the portable Node in `.tools/` exist only on the original machine. `rea-tool/` is a git submodule; fetch it with `git submodule update --init`, and install Node 24.22.1 or newer from nodejs.org to run it.

## Requirements

- Windows with Node.js 22 or newer (`node -v` to check).
- Google Chrome or Edge.
- An internet connection. Both apps load satellite imagery and map tiles online, and AgroLens also talks to Farmonaut's servers.

## 1. Fieldwise (port 5180)

First time only, install the dependencies:

```bash
cd fieldwise
npm install
```

Then start it:

```bash
cd fieldwise
npm run dev
```

Open http://127.0.0.1:5180. Leave the terminal open; closing it stops the app.

Other commands:

| Command | What it does |
|---------|--------------|
| `npm run build` | Type-checks and builds a production version into `fieldwise/dist/` |
| `npm run preview` | Serves that production build |

Tips:
- All data is a built-in demo saved in your browser. Use the user menu (top right) and choose **Reset demo data** to start fresh.
- In the same menu, **View the app as** switches between owner, manager and field-staff roles.
- The splash screen plays once per browser tab. Press **Skip** to jump past it.

## 2. AgroLens (port 5173)

No install step. Start the server:

```bash
cd sat-local
node server.mjs 5173
```

Open http://localhost:5173. Leave the terminal open.

### Change the name, colour or logo

Edit `sat-local/brand.json`, save it, and refresh the browser. The server reloads the file on its own, so no restart is needed.

```json
{
  "name": "AgroLens",
  "hue": 235,
  "accent": "#e9b54a"
}
```

| Setting | Meaning |
|---------|---------|
| `name` | Brand name. It replaces "Farmonaut" in the page text and is drawn into the generated logo. |
| `hue` | Replaces Farmonaut's teal. Some values: 235 indigo, 265 violet, 150 green, 20 orange, 340 magenta. |
| `accent` | Colour of the satellite dot in the logo. |

To see the original, un-reskinned copy, run `node server.mjs 5173 --original`.

> **Important:** AgroLens is Farmonaut's own front-end code running on your machine. Logging in, mapping a field or signing up still creates real records on Farmonaut's servers. Keep it local and don't publish it.

## 3. Running both at once

Open two terminals:

```bash
# Terminal 1
cd fieldwise
npm run dev

# Terminal 2
cd sat-local
node server.mjs 5173
```

Then open both addresses in your browser.

## 4. REA (optional)

REA needs Node **24.22.1 or newer**. A portable copy is in `.tools/`, so put it first on your PATH for the session:

```bash
# Git Bash
export PATH="$PWD/.tools/node-v24.22.1-win-x64:$PATH"
cd rea-tool
node scripts/rea.mjs --help
```

```powershell
# PowerShell
$env:PATH = "$PWD\.tools\node-v24.22.1-win-x64;$env:PATH"
cd rea-tool
node scripts/rea.mjs --help
```

The findings from analysing Farmonaut are in `analysis/REPORT.md`.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Port 5180 is in use" or "address already in use" | An old copy is still running. Close its terminal, or stop it in PowerShell: `Get-NetTCPConnection -LocalPort 5180 -State Listen \| % { Stop-Process -Id $_.OwningProcess }` (swap in 5173 for AgroLens). |
| The page loads but the map or slab stays blank | Imagery is still loading or your connection is slow. Wait a few seconds and refresh. |
| Fieldwise looks stuck on old data | Use **Reset demo data** in the user menu. |
| `npm` or `node` not found | Install Node.js from nodejs.org, then open a new terminal. |
