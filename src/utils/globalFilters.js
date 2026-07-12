// These defaults represent "no filtering active" — deliberately WIDER than
// anything in the 1995-2025 OMNI record, so the untouched state passes every
// real value through. (The old defaults — speed [300,900], bz [-30,20] —
// silently nulled the extreme values storms are about: Halloween 2003 speed
// exceeded 1000 km/s and Bz dropped below -30 nT, and both vanished from the
// charts while every filter LOOKED untouched.)
export const DEFAULT_FILTERS = {
  severity: { quiet: true, moderate: true, intense: true, severe: true },
  speed:    [0, 2000],
  density:  [0, 200],
  bz:       [-100, 100],
  kp:       [0, 9],
  dst:      [-700, 200],
  resolution: 'hourly',
}

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

// Pressure/Temperature/|B| range filters were removed: Pdyn is derived from
// speed+density (filtering it separately is redundant), and temp/|B| were
// niche enough that they only added menu clutter. Severity-nulling below
// still covers every plotted field, including those three.
const RANGE_FIELDS = [
  ['flow_speed_kms',     'speed'],
  ['proton_density_ncc', 'density'],
  ['bz_gsm_nT',          'bz'],
  ['kp',                 'kp'],
  ['dst_omni',           'dst'],
]

// Every field the filtered views (Time Series, Phase Space) actually plot —
// all of these get nulled when a row's severity is unchecked, even the ones
// that no longer have their own range filter (Pdyn/Temp/|B|).
const PLOTTED_FIELDS = [
  'flow_speed_kms', 'proton_density_ncc', 'bz_gsm_nT', 'kp', 'dst_omni',
  'pdyn_computed_nPa', 'proton_temp_K', 'imf_mag_scalar_nT', 'sw_type',
]

// Keeps every row (same length/order/timestamps) so V1's line-chart gaps
// stay honest — nulls out only the specific fields that fail their own
// range, plus every plotted field (not `datetime`) if the row's severity
// isn't checked. Nulled-in-place rather than `data.filter(...)`: removing
// rows would make d3 interpolate a straight line across a real gap.
export function applyGlobalFilters(data, filters, stormCatalog) {
  if (!data?.length) return data
  return data.map(row => {
    const sev = rowSeverity(row.datetime, stormCatalog)
    const sevOk = filters.severity[sev] !== false
    const out = { ...row }
    if (!sevOk) {
      for (const field of PLOTTED_FIELDS) out[field] = null
      // Also clear storm_flag itself, so V1's storm shading (which reads
      // storm_flag directly) doesn't keep drawing an intact-looking storm
      // band over data that's just been nulled above.
      out.storm_flag = 0
      return out
    }
    for (const [field, key] of RANGE_FIELDS) {
      // Normalize reversed bounds (user typed min > max) instead of silently
      // nulling every value in the range's gap.
      const lo = Math.min(filters[key][0], filters[key][1])
      const hi = Math.max(filters[key][0], filters[key][1])
      const v = out[field]
      if (v == null || v < lo || v > hi) out[field] = null
    }
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
// nulls per field (NaN-skipping mean/max/min, like pandas does server-side).
// Emits `T00:00:00` with no `Z`, matching /api/data's own convention, so
// storm-shading and `new Date()` keep working.
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
