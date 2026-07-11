import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  parseISO,
  format,
  differenceInDays,
  addDays,
  subDays
} from "date-fns";
import V1 from './components/V1'
import V2 from './components/V2'
import V3 from './components/V3'
import V5 from './components/V5'
import StormAnalysis from './components/StormAnalysis'
import Sidebar from './components/Sidebar'
import MenuBar from './components/MenuBar'
import { DEFAULT_FILTERS, DEFAULT_VISIBLE_ORBITS, applyGlobalFilters, aggregateDaily } from './utils/globalFilters'

const DEFAULT_START = '2003-10-25'
const DEFAULT_END   = '2003-11-10'
const DATASET_START = parseISO("1995-01-01")
const DATASET_END   = parseISO("2025-12-31")

const MAX_RANGE_DAYS = 365 * 2
const MIN_RANGE_DAYS = 2

// Storm Comparison and Bz→Dst Correlation were originally separate subpages
// but are merged back into one ("Storm Analysis") — a shared storm picker
// drives both the shock-aligned comparison charts and the lag-correlation
// panel side by side, so nothing about picking a storm is duplicated.
const SECTIONS = [
  { id: 'orbital',     title: 'Orbital Exposure Simulator',  description: 'LEO/Polar/MEO/GEO shells against the live magnetopause.' },
  { id: 'timeseries',  title: 'Time Series',                description: 'Speed, density, Bz and Pdyn over time, storm periods shaded.' },
  { id: 'phasespace',  title: 'Phase Space',                 description: 'Density vs. speed scatter; lasso to select, color by |B|/Bz/Kp.' },
  { id: 'spectrogram', title: 'Event Spectrogram',           description: 'Multi-parameter heatmap; click a storm band to inspect.' },
  { id: 'analysis',    title: 'Storm Analysis',              description: 'Shock-aligned storm comparison plus lagged Bz→Dst correlation.' },
]

export default function App() {
  const [data, setData]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [start, setStart]       = useState(DEFAULT_START)
  const [end, setEnd]           = useState(DEFAULT_END)
  const [draftStart, setDraftStart] = useState(DEFAULT_START)
  const [draftEnd, setDraftEnd] = useState(DEFAULT_END)

  // Full storm catalog (id/peak_time/intensity/...) — fetched once, shared by
  // V3 (click-to-select), Storm Comparison/Correlation (pickers), V5 (quick-jump).
  const [stormCatalog, setStormCatalog] = useState([])
  useEffect(() => {
    fetch('/api/orbital/storms')
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(setStormCatalog)
      .catch(e => console.error('Failed to load storm catalog:', e))
  }, [])

  // Linked-view state shared across panels.
  // selectedPoints: ISO timestamps lassoed in V2 — shown as tick marks in V1/V3.
  const [selectedPoints, setSelectedPoints] = useState([])
  // selectedStorm: set by clicking a storm band in V3, or picking one in V4;
  // simDate/simHour follow it so V5 can jump to the same moment (a one-way
  // "documented deviation", not a two-way sync — V5 has its own controls too).
  const [selectedStorm, setSelectedStorm] = useState(null)
  // compareStorm: the "Compare" menu's pick — an optional second storm
  // overlaid (dashed) on Storm Analysis's charts. Independent of
  // selectedStorm/simDate/simHour, which drive the primary storm everywhere.
  const [compareStorm, setCompareStorm] = useState(null)
  const [simDate, setSimDate] = useState(DEFAULT_START)
  const [simHour, setSimHour] = useState(0)

  const [activeSection, setActiveSection] = useState('orbital')

  // Global filters — only Time Series/Phase Space/Event Spectrogram respect
  // these (via `filteredData` below); Storm Comparison/Correlation/Orbital
  // fetch their own independent windows and are untouched by design.
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [visibleOrbits, setVisibleOrbits] = useState(new Set(DEFAULT_VISIBLE_ORBITS))

  const filteredData = useMemo(() => {
    const filtered = applyGlobalFilters(data, filters, stormCatalog)
    return filters.resolution === 'daily' ? aggregateDaily(filtered) : filtered
  }, [data, filters, stormCatalog])

  function resetFilters() {
    setFilters(DEFAULT_FILTERS)
    setVisibleOrbits(new Set(DEFAULT_VISIBLE_ORBITS))
    setSelectedStorm(null)
    setCompareStorm(null)
    // Otherwise a stale lasso selection keeps showing as violet tick marks in
    // Time Series/Event Spectrogram with nothing left that produced it.
    setSelectedPoints([])
  }

  // Picking a storm anywhere (V3 click, MenuBar's Storm/Compare menus, V5's
  // own picker) drives this one path. Passive — no navigation — since a menu
  // pick shouldn't yank the user off whatever view they're on.
  const jumpToStorm = (storm) => {
    setSelectedStorm(storm)
    if (storm?.peak_time) {
      setSimDate(storm.peak_time.slice(0, 10))
      setSimHour(Number(storm.peak_time.slice(11, 13)))
    }
  }

  // Clicking a storm band directly on a chart (Event Spectrogram) reads as
  // an explicit "inspect this" gesture, unlike a passive menu pick — so this
  // variant also drills through to the Storm Analysis view.
  const jumpToStormAndView = (storm) => {
    jumpToStorm(storm)
    setActiveSection('analysis')
  }

  // Every loaded-window change clears the lasso selection (points may fall
  // outside the new window) but never touches selectedStorm/simDate/simHour —
  // V4/V5 are intentionally decoupled from the header's date range.
  const applyRange = (newStart, newEnd) => {
    setStart(newStart)
    setEnd(newEnd)
    setDraftStart(newStart)
    setDraftEnd(newEnd)
    setSelectedPoints([])
  }

  // True right after a V1 drag-to-select (or a manual edit in the Date
  // Range popover) until the user applies or discards it — drives the
  // pending-range banner below the top bar.
  const hasPendingRange = draftStart !== start || draftEnd !== end

  const zoomIn = () => {

  const s = parseISO(start)
  const e = parseISO(end)

  const days = differenceInDays(e, s)

  if (days <= MIN_RANGE_DAYS) return

  const newDays = Math.max(MIN_RANGE_DAYS, Math.floor(days / 2))

  const center = new Date((s.getTime() + e.getTime()) / 2)

  const newStart = subDays(center, Math.floor(newDays / 2))
  const newEnd = addDays(center, Math.ceil(newDays / 2))

  applyRange(format(newStart, "yyyy-MM-dd"), format(newEnd, "yyyy-MM-dd"))
}

const zoomOut = () => {

  const s = parseISO(start)
  const e = parseISO(end)

  const days = differenceInDays(e, s)

  if (days >= MAX_RANGE_DAYS) return

  const newDays = Math.min(MAX_RANGE_DAYS, days * 2)

  const center = new Date((s.getTime() + e.getTime()) / 2)

  let newStart = subDays(center, Math.floor(newDays / 2))
  let newEnd = addDays(center, Math.ceil(newDays / 2))

  if (newStart < DATASET_START)
      newStart = DATASET_START

  if (newEnd > DATASET_END)
      newEnd = DATASET_END

  applyRange(format(newStart, "yyyy-MM-dd"), format(newEnd, "yyyy-MM-dd"))
}

const panLeft = () => {

  const s = parseISO(start)
  const e = parseISO(end)

  const days = differenceInDays(e, s)

  let newStart = subDays(s, Math.max(1, Math.floor(days / 4)))
  let newEnd = subDays(e, Math.max(1, Math.floor(days / 4)))

  if (newStart < DATASET_START) {

    newStart = DATASET_START
    newEnd = addDays(DATASET_START, days)

  }

  applyRange(format(newStart, "yyyy-MM-dd"), format(newEnd, "yyyy-MM-dd"))
}

const panRight = () => {

  const s = parseISO(start)
  const e = parseISO(end)

  const days = differenceInDays(e, s)

  let newStart = addDays(s, Math.max(1, Math.floor(days / 4)))
  let newEnd = addDays(e, Math.max(1, Math.floor(days / 4)))

  if (newEnd > DATASET_END) {

      newEnd = DATASET_END
      newStart = subDays(DATASET_END, days)

  }

  applyRange(format(newStart, "yyyy-MM-dd"), format(newEnd, "yyyy-MM-dd"))
}

  const fetchData = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/data?start=${start}&end=${end}`)
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [start, end])

  useEffect(() => { fetchData() }, [fetchData])

  function renderActiveSection() {
    switch (activeSection) {
      case 'timeseries':
        return <V1 data={filteredData} setDraftStart={setDraftStart} setDraftEnd={setDraftEnd} selectedPoints={selectedPoints} selectedStorm={selectedStorm} />
      case 'phasespace':
        return <V2 data={filteredData} selectedPoints={selectedPoints} onSelectPoints={setSelectedPoints} />
      case 'spectrogram':
        return <V3 data={filteredData} selectedPoints={selectedPoints} stormCatalog={stormCatalog} onSelectStorm={jumpToStormAndView} selectedStorm={selectedStorm} />
      case 'analysis':
        return <StormAnalysis selectedStorm={selectedStorm} compareStorm={compareStorm} />
      case 'orbital':
        return <V5 simDate={simDate} simHour={simHour} setSimDate={setSimDate} setSimHour={setSimHour} stormCatalog={stormCatalog} visibleOrbits={visibleOrbits} />
      default:
        return null
    }
  }

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-space-bg text-space-dim font-sans">
      {/* Header — title/branding + status only, its own row. */}
      <header className="flex-none border-b border-space-hairline bg-space-panel/90 px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-space-text tracking-tight whitespace-nowrap leading-none">
            Solar Wind &amp; Space Weather Analytics
            <span className="hidden xl:inline ml-3 text-xs font-mono font-normal text-space-faint tracking-normal">
              CS661 · Group 21 · NASA OMNI
            </span>
          </h1>

          {/* Status */}
          <div className="ml-auto flex items-center gap-2 font-mono">
            {loading && (
              <span className="flex items-center gap-1.5 text-xs text-violet-300">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-300 animate-pulse" />
                Fetching…
              </span>
            )}
            {error && (
              <span className="text-xs text-space-danger">
                API error: {error} — is Flask running on port 5000?
              </span>
            )}
            {!loading && !error && data.length > 0 && (
              <span className="text-xs text-space-faint tabular-nums">
                {data.length.toLocaleString()} records · {start} → {end}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Global filters — their own row, centered as a group. */}
      <div className="flex-none border-b border-space-hairline bg-space-panel/60 px-3 py-2 flex justify-center">
        <MenuBar
          filters={filters}
          setFilters={setFilters}
          visibleOrbits={visibleOrbits}
          setVisibleOrbits={setVisibleOrbits}
          stormCatalog={stormCatalog}
          selectedStorm={selectedStorm}
          onSelectStorm={jumpToStorm}
          compareStorm={compareStorm}
          onSelectCompareStorm={setCompareStorm}
          start={start}
          end={end}
          draftStart={draftStart}
          draftEnd={draftEnd}
          setDraftStart={setDraftStart}
          setDraftEnd={setDraftEnd}
          onApplyRange={applyRange}
          loading={loading}
          onPanLeft={panLeft}
          onPanRight={panRight}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onPreset={applyRange}
          onReset={resetFilters}
        />
      </div>

      {/* Loading progress bar — fixed-height slot so paging doesn't shift the layout */}
      <div className="flex-none h-0.5 bg-transparent">
        {loading && <div className="h-full bg-space-violet animate-pulse" style={{ width: '60%' }} />}
      </div>

      {/* Pending-range banner — appears only after a V1 chart drag (or a
          manual edit in the Date Range popover) hasn't been applied yet, so
          that interaction has an immediate, visible next step instead of a
          hidden one buried in the popover. */}
      {hasPendingRange && (
        <div className="flex-none flex items-center justify-center gap-3 px-4 py-1.5 bg-space-violet/10 border-b border-space-hairline text-xs font-mono">
          <span className="text-space-dim">
            Pending range from chart selection: <b className="text-space-text tabular-nums">{draftStart} → {draftEnd}</b>
          </span>
          <button
            onClick={() => applyRange(draftStart, draftEnd)}
            className="px-2.5 py-0.5 rounded bg-space-violet hover:bg-violet-500 text-white text-[11px] font-medium transition-colors"
          >
            Apply
          </button>
          <button
            onClick={() => { setDraftStart(start); setDraftEnd(end) }}
            className="px-2.5 py-0.5 rounded bg-space-panel-2 border border-space-hairline text-space-dim hover:text-space-text text-[11px] transition-colors"
          >
            Discard
          </button>
        </div>
      )}

      {/* Sidebar of numbered subpages + a single full-space active view,
          instead of all 5 panels crammed on screen at once. */}
      <main className="flex-1 min-h-0 flex gap-3 px-3 pb-3 pt-3">
        <Sidebar sections={SECTIONS} activeId={activeSection} onSelect={setActiveSection} />
        <div className="flex-1 min-w-0 min-h-0">
          {renderActiveSection()}
        </div>
      </main>
    </div>
  )
}
