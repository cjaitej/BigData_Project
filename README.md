# Solar Wind & Space Weather Analytics

CS661 · Big Data Visual Analytics · IIT Kanpur · Group 21

An interactive dashboard for exploring 31 years (1995–2025) of NASA OMNI solar
wind and geomagnetic data — solar wind speed/density/IMF, geomagnetic indices
(Kp, Dst/SYM-H, AE), and cataloged geomagnetic storms.

---

## How to run

**Requirements:** Node.js ≥ 18, Python ≥ 3.10

### 1. Install dependencies

```bash
npm install
cd server && pip install -r requirements.txt && cd ..
```

### 2. Start the backend and frontend (two terminals)

```bash
# Terminal 1 — Flask API (port 5000)
cd server
python app.py

# Terminal 2 — Vite dev server (port 5173)
npm run dev
```

### 3. Open the app

```
http://localhost:5173
```

Vite proxies `/api/*` requests to the Flask server, so both must be running.

---

## What's in the dashboard

All five views are visible at once on a single page, sharing a top menu bar
(date range, storm playback/jump controls, and numeric filters).

| View | What it shows |
|---|---|
| **Orbital Exposure Simulator** | Earth-centric canvas scene — LEO/Polar/MEO/GEO satellite shells plotted at true scale against the live Shue et al. (1998) magnetopause, with a per-shell radiation exposure score for the selected date/hour. |
| **Time Series** | Two stacked line charts over the loaded date range, each parameter user-selectable (Speed, Density, Bz, Pdyn, Dst, Kp, AE, Temp, \|B\|), with storm shading, a live time cursor, and a "compare vs" overlay to line up a second storm against the selected one. |
| **Phase Space** | Density vs. speed scatter plot with marginal histograms; lasso-select points to see summary stats, colored by \|B\|, Bz, or Kp. |
| **Seasonal Pattern** | Mean geomagnetic activity by calendar month as a radial bar chart — shows the Russell-McPherron semiannual effect (activity peaks near the equinoxes). |
| **Threat Escalation Flow** | A Sankey diagram tracing solar wind driver type → Bz direction → storm outcome, showing how often each type of solar wind actually turns into a geomagnetic storm. |

Global filters (severity, Speed/Density/Bz/Kp/Dst ranges, hourly/daily
resolution) apply to Time Series and Phase Space. Seasonal Pattern and Threat
Escalation Flow follow the Date Range only, since they're server-side
aggregates over whatever window is loaded.

---

## Project structure

```
server/
  app.py                 Flask API — reads omni_processed.csv, serves all endpoints
  omni_processed.csv      Preprocessed OMNI dataset
src/
  App.jsx                 Top-level layout, shared state, global filters
  components/              One file per view (V1/V2/V5, SeasonalPattern, ThreatEscalation, MenuBar)
  hooks/useStormDetail.js  Shared shock-aligned storm-window fetch hook
  utils/                   Filtering, storm-window fetch, Shue magnetopause model, shared constants
DataPreprocessing/        Standalone scripts used to build omni_processed.csv from raw data
```

## API endpoints

| Endpoint | Description |
|---|---|
| `GET /api/data?start=YYYY-MM-DD&end=YYYY-MM-DD` | Hourly records for a date range |
| `GET /api/orbital/storms` | Cataloged storm events (contiguous SYM-H < -50 nT runs ≥ 3h) |
| `GET /api/seasonal?start=&end=` | Mean Kp/AE/electric-field by calendar month |
| `GET /api/escalation_flow?start=&end=` | Hour counts by driver type / Bz direction / storm outcome |
| `GET /api/storms`, `GET /api/range` | Legacy/utility endpoints |

## Tech stack

- **Frontend:** React 19, D3.js v7, Tailwind CSS v4, Vite
- **Backend:** Flask, pandas
- **Data:** NASA OMNI hourly solar wind / geomagnetic data, 1995–2025
