# Solar Wind & Space Weather Analytics

**CS661 · Big Data Visual Analytics · IIT Kanpur · Group 21**

An interactive visual-analytics dashboard for 31 years (1995–2025) of NASA OMNI
solar wind and geomagnetic data. It puts five linked views on a single screen so
you can follow a geomagnetic storm end-to-end: from the solar wind that drove it,
through the magnetosphere's response, to the radiation exposure that satellites
in each orbital shell would have experienced at that exact hour.

The full write-up is in [`CS661_ProjectReport_Group21.pdf`](CS661_ProjectReport_Group21.pdf).

---

## 1. What problem this addresses

Space weather data is abundant but hard to *reason about*. NASA's OMNI archive
gives you hourly measurements of the solar wind and of Earth's geomagnetic
response, but the raw files are 47-column fixed-width text dumps with numeric
fill markers, and the interesting physics lives in the relationship *between*
parameters — a southward magnetic field arriving on a fast, dense stream is
dangerous; the same field on a slow stream usually isn't.

This dashboard makes those relationships directly visible:

- **Which solar wind conditions actually produce storms?** — the Sankey flow
  quantifies how often each driver type escalates into a storm hour.
- **What does a storm do to satellites?** — the orbital simulator draws the real
  magnetopause boundary for a chosen hour, and scores exposure per shell.
- **Are storms seasonal?** — the radial chart surfaces the Russell–McPherron
  semiannual effect (equinox months are more active than solstice months).
- **How do two storms compare?** — the time series can overlay a second storm
  aligned on its shock arrival rather than on the calendar.

### Dataset at a glance

| | |
|---|---|
| Source | NASA OMNI (OMNIWeb HRO, 1-minute definitive → resampled hourly) |
| Coverage | 1995-01-01 00:00 UT → 2025-12-31 23:00 UT |
| Rows | 271,752 hourly records |
| Columns | 24 (measured + derived + normalized) |
| Storms cataloged | 676 — 536 moderate, 120 intense, 20 severe |
| Driver classes | slow stream 172,806 h · fast stream 84,993 h · CME ejecta 2,366 h · unknown 11,587 h |
| Processed file | `server/omni_processed.csv` (~92 MB, committed) |

---

## 2. How to run

**Requirements:** Node.js ≥ 18, Python ≥ 3.10

### Install

```bash
npm install
cd server && pip install -r requirements.txt && cd ..
```

### Start both processes (two terminals)

```bash
# Terminal 1 — Flask API on port 5000
cd server
python app.py

# Terminal 2 — Vite dev server on port 5173
npm run dev
```

### Open

```
http://localhost:5173
```

Vite proxies `/api/*` to `http://localhost:5000` (see [vite.config.js](vite.config.js)),
so **both processes must be running**. If Flask is down, the header shows
`API error … — is Flask running on port 5000?`.

Flask loads the whole 92 MB CSV into memory at import and precomputes the storm
catalog, seasonal aggregate, and escalation flow at startup — expect a few
seconds before the first request is served.

Other scripts: `npm run build` (production bundle), `npm run preview`,
`npm run lint`.

---

## 3. The dashboard

All five views render at once on one non-scrolling screen, under a shared menu
bar. Layout: Orbital Simulator / Phase Space / Seasonal on the top row, Time
Series / Threat Escalation on the bottom row. Any panel can be blown up with its
⛶ button; **Esc** closes it.

### 3.1 Orbital Exposure Simulator — [`V5.jsx`](src/components/V5.jsx)

An Earth-centric canvas scene for one specific **date + hour**, animated with
`requestAnimationFrame`.

- **Orbital shells at true scale**, in Earth radii: LEO 400 km ≈ 1.06 Re,
  Polar 850 km ≈ 1.13 Re, MEO 20,200 km ≈ 4.17 Re, GEO 35,786 km ≈ 6.61 Re.
  Each shell can be toggled off.
- **Live magnetopause** from the Shue et al. (1998) empirical model
  ([`shue.js`](src/utils/shue.js)), computed from that hour's *measured* Bz and
  dynamic pressure:

  ```
  r₀ = (10.22 + 1.29·tanh(0.184·(Bz + 8.14))) · Pdyn^(−1/6.6)
  α  = (0.58 − 0.007·Bz) · (1 + 0.024·ln Pdyn)
  r(θ) = r₀ · (2 / (1 + cos θ))^α
  ```

  During strong storms r₀ compresses below 6.61 Re, the boundary sweeps inside
  the GEO shell, and satellites caught outside it are ringed in red — the
  physical mechanism behind real GEO spacecraft anomalies.
- **Per-shell exposure score** (0–1; safe < 0.34 ≤ elevated < 0.62 ≤ danger),
  built from the normalized columns:

  | Shell | Score |
  |---|---|
  | GEO | 0.55·mpFactor + 0.30·AE + 0.15·\|B\| |
  | MEO | 0.45·clamp(−Dst/250) + 0.35·AE + 0.20·speed |
  | LEO | 0.45·AE + 0.35·(Kp/9) + 0.20·density |
  | Polar | 0.50·AE + 0.30·(1 − Bz) + 0.20·speed |

  where `mpFactor = clamp((9 − r₀)/2.4)`.
- **Gap handling:** if the selected hour has unusable measurements (instrument
  saturation), it falls back to the nearest valid hour within ±6 h and says so;
  with nothing usable it draws a dashed default boundary (Bz 0 nT, Pdyn 2 nPa).
- **Physically driven visuals:** aurora glow intensity tracks AE, shockwave
  rings pulse faster as exposure rises. Stars, corona granulation, streamline
  motion, and satellite orbital motion are decorative only.
- Hovering a satellite gives its shell, level, and score.

### 3.2 Time Series — [`V1.jsx`](src/components/V1.jsx)

Two stacked line charts over the loaded date range. Each row's parameter is
independently selectable from **Speed, Density, Bz, Pdyn, Dst, Kp, AE, Temp, |B|**
(defaults: Speed / Dst; Kp draws as a step curve, Bz and Dst get a zero line).

- Red wash marks storm intervals; violet ticks mark points lassoed in Phase Space.
- Shared crosshair + tooltip listing every parameter at the hovered hour.
- **Drag horizontally** to propose a new date range — it appears as a pending
  banner with Apply / Discard rather than reloading immediately.
- **Compare vs**: overlay a second storm as a dashed curve. When a main storm is
  selected, both storms are **shock-aligned** — [`useStormDetail.js`](src/hooks/useStormDetail.js)
  finds each storm's steepest positive hourly ΔPdyn in the 48 h before the SYM-H
  minimum and re-indexes the window (−12 h to +72 h) around it, so two storms
  line up on physical onset rather than on wall-clock date.
- A playback cursor sweeps through during play, updated without a full redraw.

### 3.3 Phase Space — [`V2.jsx`](src/components/V2.jsx)

Proton density (log x) vs. flow speed (linear y) scatter, with marginal
histograms on both axes (density binned in log space, speed in linear space).

- Points colored by **|B|**, **Bz**, or **Kp** — Bz uses a diverging scale
  (signed), the others sequential viridis.
- **Lasso-select** a region to get a summary card: point count, mean speed and
  density, mean and minimum Bz, mean Kp, storm-hour percentage, and time extent.
  The selection propagates to Time Series as tick marks.
- The selected storm's points are ringed; the playback cursor is drawn in-plot.

The regions in this plot are physically meaningful: slow/dense wind clusters
bottom-right, fast/tenuous coronal-hole streams top-left, and CME ejecta shows
up as high-speed points with strong |B|.

### 3.4 Seasonal Pattern — [`SeasonalPattern.jsx`](src/components/SeasonalPattern.jsx)

Mean geomagnetic activity by calendar month as a radial bar chart (Jan at 12
o'clock, clockwise), colored on a viridis scale with a dashed reference circle
at the overall mean.

Selectable metric: **mean Kp**, **mean AE**, or **mean electric field (Ey)**.
Equinox months (March, September) are marked green and solstice months (June,
December) amber — the equinox bulge is the **Russell–McPherron effect**, where
Earth's dipole tilt makes the Parker-spiral field more effective at producing a
southward IMF component near the equinoxes.

### 3.5 Threat Escalation Flow — [`ThreatEscalation.jsx`](src/components/ThreatEscalation.jsx)

A three-stage Sankey — **driver type → Bz direction → storm outcome** — built
by hand with plain SVG ribbons (no `d3-sankey`), so column layout and ribbon
sizing are explicit.

Every hour in the loaded range flows through: what kind of solar wind it was
(slow stream / fast stream / CME ejecta / unknown), whether Bz was southward or
northward, and whether it was a storm hour. It answers the question the other
views only hint at: *what fraction of each driver type actually escalates?* CME
ejecta is a thin ribbon overall but sends a disproportionate share into the
storm-hour node.

### 3.6 Menu bar & shared state — [`MenuBar.jsx`](src/components/MenuBar.jsx), [`App.jsx`](src/App.jsx)

| Control | Behavior |
|---|---|
| 📅 **Date Range** | Start/End pickers with Apply, pan ◀ ▶, zoom − +, and presets (Halloween 2003, St. Patrick 2015). Zoom is bounded to 2 days … 2 years and clamped to the dataset. |
| ⏵ **Play / pause** | Sweeps an hour-by-hour cursor through the loaded window at 1× / 2× / 5× / 10×, driving the cursor in Time Series and Phase Space *and* the Orbital Simulator's date+hour. |
| ◀ **STORM** ▶ | Steps chronologically through the cataloged storms currently visible under the severity filter. |
| ⚠ **Jump to storm** | Picks a storm from the catalog, reframes the date window around it (−3 d / +4 d) if needed, and anchors every panel to its onset. |
| **Solar Wind** | Numeric range filters: Speed, Density, Bz. |
| **Geomagnetic** | Storm severity checkboxes (moderate / intense / severe) plus Kp and Dst ranges. |
| **Resolution** | Hourly or daily (daily is the default; it means a full year loads as ~365 points instead of ~8,760). |
| ↺ **Reset** | Restores default filters, range, and playback state. |

**Linked-view behavior.** Global filters apply to **Time Series** and **Phase
Space** via `filteredData`. Seasonal Pattern and Threat Escalation follow only
the Date Range, because they are server-side aggregates over the loaded window.
The storm catalog is fetched once and narrowed by the severity filter, so
turning off a severity narrows the jump list, the ◀/▶ stepper, and the
"Compare vs" picker consistently.

**Filtering is non-destructive to layout.** [`globalFilters.js`](src/utils/globalFilters.js)
nulls out-of-range *fields* while keeping every row, so filtered-out periods
appear as genuine gaps in the line charts instead of being silently bridged.

---

## 4. Architecture

```
Browser (React 19 + D3 v7 + Tailwind v4, Vite dev server :5173)
    │  /api/*  ── proxied ──▶
Flask API (:5000)
    │  reads once at startup
server/omni_processed.csv   ◀── built offline by DataPreprocessing/
                                 from NASA OMNIWeb
```

The split is deliberate: heavy aggregation (storm detection, monthly means,
flow counts) runs once in pandas at server startup and is served as small JSON;
the browser only ever receives the hourly rows for the visible window plus a few
KB of aggregates. That keeps a 271k-row, 31-year dataset interactive without a
database.

### Project structure

```
server/
  app.py                    Flask API — loads the CSV, precomputes aggregates, serves all endpoints
  omni_processed.csv        Preprocessed OMNI dataset (271,752 hourly rows)
  requirements.txt          flask, flask-cors, pandas, numpy, pyarrow

src/
  App.jsx                   Layout, shared state, filters, playback, zoom/pan, keyboard handling
  main.jsx                  React entry point
  index.css                 Shared "space" theme — Tailwind v4 @theme tokens + fonts
  components/
    V5.jsx                  Orbital Exposure Simulator (canvas + rAF)
    V1.jsx                  Time Series (two selectable stacked charts)
    V2.jsx                  Phase Space (scatter + marginal histograms + lasso)
    SeasonalPattern.jsx     Radial bar chart by calendar month
    ThreatEscalation.jsx    Hand-built 3-stage Sankey
    MenuBar.jsx             Top control bar (range, playback, filters)
    FullscreenFrame.jsx     Panel shell — normal or full-screen overlay
    FullscreenButton.jsx    The ⛶ toggle
  hooks/
    useStormDetail.js       Shock-aligned storm window fetch (steepest ΔPdyn detection)
  utils/
    globalFilters.js        Severity/range filtering + daily aggregation
    fetchWindow.js          Inclusive date-window fetch helpers
    shue.js                 Shue et al. (1998) magnetopause model
    swType.js               Driver-type colors and labels

DataPreprocessing/
  dataset_extractor.py      Downloads 1995–2026 OMNI HRO data from NASA, year by year
  parse_html.py             Strips OMNIWeb's HTML wrapper down to numeric data lines
  pipeline.py               Cleans, joins Kp/Dst, derives, detects storms, classifies, normalizes

V2_And_V5/                  Standalone pre-React HTML/D3 prototypes of V2 and V5,
                            driven by static JSON — kept for reference
CS661_ProjectReport_Group21.pdf   Project report
```

### Design system

One palette and font pair, defined as Tailwind v4 `@theme` tokens in
[`index.css`](src/index.css), is used by every panel — a dark "space" scheme
(`#0A0C10` background, teal/amber/red status colors, violet accents) with
Space Grotesk for UI text and JetBrains Mono for numbers. `color-scheme: dark`
is set so native date pickers and dropdown arrows render in their dark variants.

---

## 5. API reference

Base URL `http://localhost:5000` (reached through Vite as `/api/*`).

| Endpoint | Params | Returns |
|---|---|---|
| `GET /api/data` | `start`, `end` (`YYYY-MM-DD`) | Hourly records in the range — 19 fields per row (measurements + `storm_flag`, `sw_type`, and the `*_norm` columns). Defaults to 2003-10-25 → 2003-11-10. |
| `GET /api/orbital/storms` | — | Storm catalog: `id`, `start`, `end`, `peak_time`, `peak_dst_nT`, `duration_hrs`, `intensity`, `peak_kp`, `peak_speed_kms`, `sw_type`. Precomputed at startup. |
| `GET /api/seasonal` | `start`, `end` (optional) | Per-month `meanKp`, `meanAE`, `meanElectricField`, `n`. With no params, returns the precomputed full-dataset aggregate. |
| `GET /api/escalation_flow` | `start`, `end` (optional) | Hour counts grouped by `sw_type` × `bz_southward` × `storm_flag`. Precomputed when unparameterized. |
| `GET /api/storms` | — | Legacy: contiguous `storm_flag` runs with `min_dst` / `max_kp`. |
| `GET /api/range` | — | Dataset `min` / `max` datetime. |

**Note on `end`:** the range filter is a plain timestamp comparison, so
`end=2003-11-10` stops at midnight of that day. [`fetchWindow.js`](src/utils/fetchWindow.js)
compensates by requesting one extra day and trimming client-side; the storm
catalog uses `Z`-suffixed timestamps while `/api/data` does not, so both are
compared as plain strings after stripping the suffix.

---

## 6. Data preprocessing pipeline

Run offline; the committed `server/omni_processed.csv` is its output, so you do
**not** need to run this to use the dashboard.

### Stage 1 — `dataset_extractor.py`

POSTs to OMNIWeb (`omniweb.gsfc.nasa.gov/cgi/nx1.cgi`) one year at a time to
stay under the 600,000-record response limit, requesting all 43 HRO variables
at 1-minute resolution. Each year is **resampled to hourly immediately** after
parsing (525k → ~8.7k rows) to keep memory flat, cached as Parquet, and skipped
on re-runs. Failed chunks retry with backoff, with a courtesy delay between
requests.

### Stage 2 — `parse_html.py`

OMNIWeb returns data wrapped in HTML. This extracts the numeric lines inside
`<pre>` blocks (lines starting with a 4-digit year) into clean text files.

### Stage 3 — `pipeline.py`

1. **Parse & clean** — maps the verified 47-column layout, converts
   year/day-of-year/hour/minute into a datetime index, replaces OMNI fill
   markers (`999.9`, `9999.0`, `99999.9`, …) with NaN **before** resampling, and
   applies per-column physical plausibility bounds (e.g. speed 100–2000 km/s,
   SYM-H −600…200 nT). Resamples to hourly means.
2. **Join Kp and Dst** — separately downloaded hourly, scaled (`kp_raw/10`) and
   range-checked, then left-joined.
3. **Derive** — dynamic pressure using the NASA OMNI convention including the
   alpha-particle correction, `Pdyn(nPa) = 2.0×10⁻⁶ · n(cm⁻³) · v(km/s)²`,
   validated against NASA's own `flow_pressure_nPa` by correlation *and* median
   ratio; plus a `bz_southward` flag.
4. **Detect storms** — contiguous runs of SYM-H < −50 nT lasting ≥ 3 h, with NaN
   breaking a run. Classified by peak SYM-H: **moderate** > −100 nT,
   **intense** ≤ −100 nT, **severe** ≤ −200 nT. Sets `storm_flag` per hour.
5. **Classify driver type** — speed < 450 km/s → slow stream; ≥ 450 with
   |B| < 15 nT → fast stream; ≥ 450 with |B| ≥ 15 nT → CME ejecta.
6. **Normalize** — robust 1st–99th percentile min-max scaling to `[0,1]` for
   Bz, speed, density, AE, Pdyn, and |B|. These `*_norm` columns are what the
   orbital exposure scores consume, which is why the scoring weights are
   comparable across parameters with wildly different units.
7. **Export** — Parquet + CSV, a `storms.json` catalog, and a
   `dataset_summary.json` with counts and coverage.

The server recomputes its own storm catalog from `sym_h_nT` at startup using the
same rule, so the two stay consistent even if the JSON isn't shipped.

---

## 7. Tech stack

| Layer | Choice |
|---|---|
| UI | React 19 (hooks only, no state library) |
| Charts | D3 v7 — SVG for V1/V2/Seasonal/Sankey, Canvas + rAF for the orbital scene |
| Styling | Tailwind CSS v4 via `@tailwindcss/vite`, tokens in `@theme` |
| Build | Vite 8, ESLint 10 with react-hooks / react-refresh plugins |
| API | Flask + flask-cors |
| Data | pandas, numpy, pyarrow |
| Source | NASA OMNI hourly solar wind & geomagnetic data, 1995–2025 |

---

## 8. Scientific references

- **Shue, J.-H., et al. (1998)** — *Magnetopause location under extreme solar
  wind conditions*, J. Geophys. Res. 103(A8). Used for the magnetopause
  standoff distance and flaring in the orbital simulator.
- **Russell, C. T., & McPherron, R. L. (1973)** — *Semiannual variation of
  geomagnetic activity*, J. Geophys. Res. 78(1). The effect the Seasonal
  Pattern view visualizes.
- **NASA/GSFC OMNIWeb** — <https://omniweb.gsfc.nasa.gov/> — data source.
- Storm intensity thresholds follow the conventional Dst/SYM-H classification
  (moderate/intense/severe at −50 / −100 / −200 nT).
