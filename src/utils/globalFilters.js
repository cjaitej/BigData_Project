// These defaults represent "no filtering active" — they match the full
// plausible range of each field, so the very first render (before the user
// touches anything) shows exactly the same data as before this feature.
export const DEFAULT_FILTERS = {
  severity: { quiet: true, moderate: true, intense: true, severe: true },
  speed:    [300, 900],
  density:  [0, 60],
  pressure: [0, 20],
  bz:       [-30, 20],
  bmag:     [0, 40],
  temp:     [0, 2000000],
  kp:       [0, 9],
  dst:      [-500, 50],
  resolution: 'hourly',
}

export const DEFAULT_VISIBLE_ORBITS = ['LEO', 'Polar', 'MEO', 'GEO']

// Both /api/data and /api/orbital/storms represent the same UTC instants,
// just formatted differently — compare as plain strings, never via
// `new Date()` (documented timezone-string-family gotcha for this project).
const stripZ = s => (s.endsWith('Z') ? s.slice(0, -1) : s)

// Which cataloged storm (if any) a given timestamp falls inside.
export function rowSeverity(datetime, stormCatalog) {
  for (const s of stormCatalog || []) {
    if (stripZ(s.start) <= datetime && datetime <= stripZ(s.end)) return s.intensity
  }
  return 'quiet'
}

const RANGE_FIELDS = [
  ['flow_speed_kms',     'speed'],
  ['proton_density_ncc', 'density'],
  ['pdyn_computed_nPa',  'pressure'],
  ['bz_gsm_nT',          'bz'],
  ['imf_mag_scalar_nT',  'bmag'],
  ['proton_temp_K',      'temp'],
  ['kp',                 'kp'],
  ['dst_omni',           'dst'],
]

// Keeps every row (same length/order/timestamps) so V1's line-chart gaps and
// V3's per-row spectrogram cells stay correct — nulls out only the specific
// fields that fail their own range, plus every plotted field (not
// `datetime`) if the row's severity isn't checked. See plan doc for why this
// is nulled-in-place rather than `data.filter(...)`.
export function applyGlobalFilters(data, filters, stormCatalog) {
  if (!data?.length) return data
  return data.map(row => {
    const sev = rowSeverity(row.datetime, stormCatalog)
    const sevOk = filters.severity[sev] !== false
    const out = { ...row }
    for (const [field, key] of RANGE_FIELDS) {
      const [lo, hi] = filters[key]
      const v = out[field]
      if (!sevOk || v == null || v < lo || v > hi) out[field] = null
    }
    // Also clear storm_flag itself when severity is filtered out, so V1/V3's
    // storm shading (which reads storm_flag directly) doesn't keep drawing an
    // intact-looking storm band over data that's just been nulled above.
    if (!sevOk) out.storm_flag = 0
    return out
  })
}

const MEAN_FIELDS = ['flow_speed_kms', 'proton_density_ncc', 'pdyn_computed_nPa', 'bz_gsm_nT', 'imf_mag_scalar_nT', 'proton_temp_K', 'ae_index_nT', 'sym_h_nT']

function mean(vals) {
  const v = vals.filter(x => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}
function maxSkipNull(vals) {
  const v = vals.filter(x => x != null)
  return v.length ? Math.max(...v) : null
}
function minSkipNull(vals) {
  const v = vals.filter(x => x != null)
  return v.length ? Math.min(...v) : null
}

// Groups already-filtered hourly rows into one row per calendar day, skipping
// nulls per field (mirrors the NaN-skipping mean/max/min already used
// server-side in build_orbital_data). Emits `T00:00:00` with no `Z`, matching
// /api/data's own convention, so storm-shading and `new Date()` keep working.
export function aggregateDaily(rows) {
  if (!rows?.length) return rows
  const byDay = new Map()
  for (const r of rows) {
    const day = r.datetime.slice(0, 10)
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day).push(r)
  }
  return [...byDay.entries()].map(([day, group]) => {
    const out = { datetime: `${day}T00:00:00`, storm_flag: maxSkipNull(group.map(r => r.storm_flag)) ?? 0 }
    for (const f of MEAN_FIELDS) out[f] = mean(group.map(r => r[f]))
    out.kp = maxSkipNull(group.map(r => r.kp))
    out.dst_omni = minSkipNull(group.map(r => r.dst_omni))
    return out
  })
}
