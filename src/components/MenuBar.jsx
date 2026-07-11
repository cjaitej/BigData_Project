import { useEffect, useMemo, useRef, useState } from 'react'

const SEVERITY_OPTIONS = [['quiet', 'Quiet'], ['moderate', 'Moderate'], ['intense', 'Intense'], ['severe', 'Severe']]
const ORBITS = ['LEO', 'Polar', 'MEO', 'GEO']
const PRESETS = [
  { label: 'Halloween 2003', start: '2003-10-25', end: '2003-11-10' },
  { label: 'St. Patrick 2015', start: '2015-03-14', end: '2015-03-22' },
]

// Compact single-row menu bar: every control (date range, storm severity,
// numeric ranges, satellite shells, resolution, comparison storm) lives
// behind a labeled dropdown instead of being permanently unfolded — replaces
// both the old FiltersBar and the header's date-range/pan-zoom/presets
// controls, which moved into the "Date Range" menu here.
export default function MenuBar({
  filters, setFilters, visibleOrbits, setVisibleOrbits,
  stormCatalog, selectedStorm, onSelectStorm,
  compareStorm, onSelectCompareStorm,
  start, end, draftStart, draftEnd, setDraftStart, setDraftEnd, onApplyRange, loading,
  onPanLeft, onPanRight, onZoomIn, onZoomOut, onPreset,
  onReset,
}) {
  const [openMenu, setOpenMenu] = useState(null)
  const barRef = useRef(null)

  // Close on any click outside the whole bar (including its open popover);
  // clicks on a different trigger button are handled by that button's own
  // toggle, and clicks inside the open popover's controls never reach here.
  useEffect(() => {
    if (!openMenu) return
    function handleClick(e) {
      if (barRef.current && !barRef.current.contains(e.target)) setOpenMenu(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [openMenu])

  const sortedCatalog = useMemo(() => {
    const rank = { severe: 0, intense: 1, moderate: 2 }
    return [...(stormCatalog || [])].sort((a, b) =>
      (rank[a.intensity] ?? 3) - (rank[b.intensity] ?? 3) || a.peak_dst_nT - b.peak_dst_nT)
  }, [stormCatalog])

  function updateRange(key, idx, value) {
    const n = Number(value)
    if (Number.isNaN(n)) return
    setFilters(f => {
      const next = [...f[key]]
      next[idx] = n
      return { ...f, [key]: next }
    })
  }
  function toggleSeverity(key) {
    setFilters(f => ({ ...f, severity: { ...f.severity, [key]: !f.severity[key] } }))
  }
  function toggleOrbit(o) {
    setVisibleOrbits(prev => {
      const next = new Set(prev)
      next.has(o) ? next.delete(o) : next.add(o)
      return next
    })
  }
  function toggle(name) {
    setOpenMenu(m => (m === name ? null : name))
  }

  return (
    <div ref={barRef} className="flex items-center gap-1 font-mono text-xs">
      <Menu label="📅 Date Range" name="date" openMenu={openMenu} onToggle={toggle} width="w-80">
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-space-dim">
            <span className="w-10 flex-none">Start</span>
            <input
              type="date" value={draftStart} min="1995-01-01" max={draftEnd}
              onChange={e => setDraftStart(e.target.value)}
              className="flex-1 min-w-0 h-7 bg-space-panel-2 border border-space-hairline rounded px-2 text-space-text text-xs focus:outline-none focus:border-space-fast"
            />
          </label>
          <label className="flex items-center gap-2 text-space-dim">
            <span className="w-10 flex-none">End</span>
            <input
              type="date" value={draftEnd} min={draftStart}
              onChange={e => setDraftEnd(e.target.value)}
              className="flex-1 min-w-0 h-7 bg-space-panel-2 border border-space-hairline rounded px-2 text-space-text text-xs focus:outline-none focus:border-space-fast"
            />
          </label>
          <button
            onClick={() => onApplyRange(draftStart, draftEnd)}
            disabled={loading}
            className="h-7 rounded bg-space-violet hover:bg-violet-500 disabled:opacity-50 text-xs text-white font-medium transition-colors"
          >
            {loading ? 'Loading…' : 'Apply'}
          </button>

          <div className="h-px bg-space-hairline" />

          <div className="flex items-center gap-1.5 justify-center">
            {[
              { label: '◀', fn: onPanLeft, hint: 'Pan left' },
              { label: '−', fn: onZoomOut, hint: 'Zoom out' },
              { label: '+', fn: onZoomIn, hint: 'Zoom in' },
              { label: '▶', fn: onPanRight, hint: 'Pan right' },
            ].map(b => (
              <button
                key={b.hint} onClick={b.fn} title={b.hint}
                className="h-7 w-7 flex items-center justify-center rounded bg-space-panel-2 border border-space-hairline text-space-dim hover:text-space-text hover:border-space-fast transition-colors"
              >
                {b.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            {PRESETS.map(p => (
              <button
                key={p.label} onClick={() => onPreset(p.start, p.end)}
                className="h-7 px-2 rounded bg-space-panel-2 hover:bg-space-panel border border-space-hairline text-[10px] text-space-dim hover:text-space-text transition-colors text-left"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="text-[10px] text-space-faint text-center pt-1 tabular-nums">{start} → {end}</div>
        </div>
      </Menu>

      <Divider />

      <Menu label="Storm" name="storm" openMenu={openMenu} onToggle={toggle} width="w-64">
        <div className="flex flex-col gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-space-faint mb-1.5">Severity</div>
            <div className="flex flex-wrap gap-x-3 gap-y-1.5">
              {SEVERITY_OPTIONS.map(([k, label]) => (
                <label key={k} className="flex items-center gap-1 text-space-dim cursor-pointer whitespace-nowrap">
                  <input type="checkbox" checked={filters.severity[k]} onChange={() => toggleSeverity(k)} className="accent-space-fast" />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-space-faint mb-1.5">Event</div>
            <select
              value={selectedStorm ? String(selectedStorm.id) : ''}
              onChange={e => {
                const s = sortedCatalog.find(st => String(st.id) === e.target.value)
                onSelectStorm(s || null)
              }}
              className="w-full h-7 bg-space-panel-2 border border-space-hairline rounded px-2 text-space-dim text-[10px]"
            >
              <option value="">All Storms</option>
              {sortedCatalog.map(s => (
                <option key={s.id} value={s.id}>{s.start.slice(0, 10)} · {s.intensity} · Dst {Math.round(s.peak_dst_nT)} nT</option>
              ))}
            </select>
          </div>
        </div>
      </Menu>

      <Menu label="Solar Wind" name="wind" openMenu={openMenu} onToggle={toggle} width="w-64">
        <div className="flex flex-col gap-2.5">
          <RangeRow label="Speed" unit="km/s" value={filters.speed} onChange={(i, v) => updateRange('speed', i, v)} />
          <RangeRow label="Density" unit="n/cc" value={filters.density} onChange={(i, v) => updateRange('density', i, v)} />
          <RangeRow label="Pressure" unit="nPa" value={filters.pressure} onChange={(i, v) => updateRange('pressure', i, v)} />
          <RangeRow label="Temperature" unit="K" value={filters.temp} onChange={(i, v) => updateRange('temp', i, v)} step={1000} />
        </div>
      </Menu>

      <Menu label="Magnetic" name="magnetic" openMenu={openMenu} onToggle={toggle} width="w-64">
        <div className="flex flex-col gap-2.5">
          <RangeRow label="Bz" unit="nT" value={filters.bz} onChange={(i, v) => updateRange('bz', i, v)} />
          <RangeRow label="|B|" unit="nT" value={filters.bmag} onChange={(i, v) => updateRange('bmag', i, v)} />
        </div>
      </Menu>

      <Menu label="Geomagnetic" name="geo" openMenu={openMenu} onToggle={toggle} width="w-64">
        <div className="flex flex-col gap-2.5">
          <RangeRow label="Kp" value={filters.kp} onChange={(i, v) => updateRange('kp', i, v)} step={0.1} />
          <RangeRow label="Dst" unit="nT" value={filters.dst} onChange={(i, v) => updateRange('dst', i, v)} />
        </div>
      </Menu>

      <Menu label="Orbit" name="orbit" openMenu={openMenu} onToggle={toggle} width="w-52">
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {ORBITS.map(o => (
            <label key={o} className="flex items-center gap-1 text-space-dim cursor-pointer whitespace-nowrap">
              <input type="checkbox" checked={visibleOrbits.has(o)} onChange={() => toggleOrbit(o)} className="accent-space-fast" />
              {o}
            </label>
          ))}
        </div>
      </Menu>

      <Menu label="Resolution" name="resolution" openMenu={openMenu} onToggle={toggle} width="w-40">
        <select
          value={filters.resolution}
          onChange={e => setFilters(f => ({ ...f, resolution: e.target.value }))}
          className="w-full h-7 bg-space-panel-2 border border-space-hairline rounded px-2 text-space-dim text-[10px]"
        >
          <option value="hourly">Hourly</option>
          <option value="daily">Daily</option>
        </select>
      </Menu>

      <Menu label="Compare" name="compare" openMenu={openMenu} onToggle={toggle} width="w-64">
        <select
          value={compareStorm ? String(compareStorm.id) : ''}
          onChange={e => {
            const s = sortedCatalog.find(st => String(st.id) === e.target.value)
            onSelectCompareStorm(s || null)
          }}
          className="w-full h-7 bg-space-panel-2 border border-space-hairline rounded px-2 text-space-dim text-[10px]"
        >
          <option value="">No comparison</option>
          {sortedCatalog.map(s => (
            <option key={s.id} value={s.id}>{s.start.slice(0, 10)} · {s.intensity} · Dst {Math.round(s.peak_dst_nT)} nT</option>
          ))}
        </select>
      </Menu>

      <Divider />

      <button
        onClick={onReset}
        className="h-8 px-3 flex items-center gap-1.5 rounded-lg bg-space-panel-2 border border-space-hairline text-space-dim hover:text-space-text hover:border-space-fast transition-colors"
      >
        <span>↺</span> Reset
      </button>
    </div>
  )
}

function Divider() {
  return <div className="h-5 w-px bg-space-hairline mx-0.5" />
}

function Menu({ label, name, openMenu, onToggle, width, children }) {
  const isOpen = openMenu === name
  return (
    <div className="relative">
      <button
        onClick={() => onToggle(name)}
        className={`h-8 px-3 flex items-center gap-1.5 rounded-lg text-xs transition-colors border ${
          isOpen ? 'bg-space-panel-2 text-space-text border-space-fast' : 'text-space-dim hover:text-space-text hover:bg-space-panel-2 border-transparent'
        }`}
      >
        {label} <span className="text-space-faint text-[9px]">▾</span>
      </button>
      {isOpen && (
        <div className={`absolute z-40 top-full left-0 mt-2 bg-space-panel border border-space-hairline rounded-xl shadow-2xl p-4 ${width}`}>
          {children}
        </div>
      )}
    </div>
  )
}

function RangeRow({ label, unit, value, onChange, step = 1 }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-space-dim w-20 flex-none text-[11px]">{unit ? `${label} (${unit})` : label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="number" step={step} value={value[0]} onChange={e => onChange(0, e.target.value)}
          className="w-16 min-w-0 bg-space-panel-2 border border-space-hairline rounded px-1.5 py-1 text-space-text text-right text-[11px] focus:outline-none focus:border-space-fast"
        />
        <span className="text-space-faint">–</span>
        <input
          type="number" step={step} value={value[1]} onChange={e => onChange(1, e.target.value)}
          className="w-16 min-w-0 bg-space-panel-2 border border-space-hairline rounded px-1.5 py-1 text-space-text text-right text-[11px] focus:outline-none focus:border-space-fast"
        />
      </div>
    </div>
  )
}
