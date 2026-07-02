# Solar Wind & Space Weather Analytics
CS661 · Big Data Visual Analytics · IIT Kanpur · Group 21

---

## Setup

**Requirements:** Node.js ≥ 18, Python ≥ 3.10

```bash
npm install
cd Server && pip install -r requirements.txt && cd ..
```

**Run (two terminals):**

```bash
# Terminal 1
cd Server && python app.py

# Terminal 2
npm run dev
```

Open http://localhost:5173

---

## Panels

| Panel | Description | Status |
|---|---|---|
| V1 | Time-series overview (SW speed, density, IMF Bz, Pdyn) | Done |
| V2 | Phase space scatter — velocity vs. density | Done |
| V3 | Event spectrogram — parameter heatmap | Done |
| V4 | Storm event inspector — 72h detail view | Pending |
| V5 | Orbital exposure simulator — Canvas magnetosphere | Pending |

---

## Working on a panel

Each component in `src/components/` receives a `data` prop — an array of hourly records for the selected date range. **Do not fetch data inside your component.**

```jsx
// src/components/V2.jsx
import { useRef, useEffect } from 'react'
import * as d3 from 'd3'

export default function V2({ data }) {
  const svgRef       = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    if (!data?.length || !svgRef.current) return

    const W = containerRef.current.clientWidth
    const H = 400

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', W).attr('height', H)

    // your D3 code here

  }, [data])

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 bg-slate-900/60">
        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-indigo-400 tracking-wider">V2</span>
        <span className="text-sm font-semibold text-slate-200">Phase Space Explorer</span>
      </div>
      <div ref={containerRef} className="relative w-full py-1">
        {!data?.length
          ? <div className="flex items-center justify-center h-48 text-slate-500 text-sm">Waiting for data…</div>
          : <svg ref={svgRef} style={{ display: 'block' }} />
        }
      </div>
    </div>
  )
}
```

### Data record shape

```js
{
  datetime:            "2003-10-29T06:00:00",
  flow_speed_kms:      721.4,   // km/s
  proton_density_ncc:  6.2,     // n/cc
  bz_gsm_nT:          -32.1,   // nT  — negative = southward = storm driver
  pdyn_computed_nPa:   7.8,     // nPa
  dst_omni:           -353.0,   // nT  — storm if < -50
  kp:                  9.0,     // 0–9
  storm_flag:          1,       // 1 during storm periods
  imf_mag_scalar_nT:   46.2,
  ae_index_nT:         2187.0,
  sym_h_nT:           -355.0,
}
```

### Useful API endpoints (called via `/api/...`)

| Endpoint | Description |
|---|---|
| `GET /api/data?start=YYYY-MM-DD&end=YYYY-MM-DD` | Hourly records for a date range |
| `GET /api/storms` | All detected storm events with `min_dst`, `max_kp` |
| `GET /api/range` | Full available date range in the dataset |

---

## Notes

- D3 is already installed — `import * as d3 from 'd3'`
- Tailwind CSS is set up — use utility classes directly in JSX
- Keep the panel header markup consistent (copy from the template above)
- Do not add horizontal padding to the chart wrapper div — it breaks D3 width calculations
