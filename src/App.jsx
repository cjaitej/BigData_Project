import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  parseISO,
  format,
  differenceInDays,
  addDays,
  subDays
} from "date-fns";
import V1 from './components/V1'
import V2 from './components/V2'
import V5 from './components/V5'
import SeasonalPattern from './components/SeasonalPattern'
import ThreatEscalation from './components/ThreatEscalation'
import Sidebar from './components/Sidebar'
import MenuBar from './components/MenuBar'
import { DEFAULT_FILTERS, applyGlobalFilters, aggregateDaily } from './utils/globalFilters'

const DEFAULT_START = '2003-10-25'
const DEFAULT_END   = '2003-11-10'
const DATASET_START = parseISO("1995-01-01")
const DATASET_END   = parseISO("2025-12-31")

const MAX_RANGE_DAYS = 365 * 2
const MIN_RANGE_DAYS = 2

const SECTIONS = [
  { id: 'orbital',     title: 'Orbital Exposure Simulator',  description: 'LEO/Polar/MEO/GEO shells against the live magnetopause.' },
  { id: 'timeseries',  title: 'Time Series',                description: 'Speed, Bz and Dst on one shared time axis, storm periods shaded.' },
  { id: 'phasespace',  title: 'Phase Space',                 description: 'Density vs. speed scatter; lasso to select, color by |B|/Bz/Kp.' },
  { id: 'seasonal',    title: 'Seasonal Pattern',             description: 'Mean Kp/AE by calendar month — the equinox storm-risk effect.' },
  { id: 'escalation',  title: 'Threat Escalation Flow',        description: 'Sankey: driver type → Bz direction → storm outcome.' },
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
  // the MenuBar's jump/step controls and Time Series' comparison picker.
  const [stormCatalog, setStormCatalog] = useState([])
  useEffect(() => {
    fetch('/api/orbital/storms')
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(setStormCatalog)
      .catch(e => console.error('Failed to load storm catalog:', e))
  }, [])

  // Linked-view state shared across panels.
  // selectedPoints: ISO timestamps lassoed in V2 — shown as tick marks in V1.
  const [selectedPoints, setSelectedPoints] = useState([])
  // selectedStorm: set from the MenuBar's jump select / ◀▶ step buttons;
  // simDate/simHour follow it so V5 jumps to the same moment (one-way — V5
  // has its own controls too). The comparison storm is NOT here: it only
  // affects Time Series, so it lives there as local state.
  const [selectedStorm, setSelectedStorm] = useState(null)
  const [simDate, setSimDate] = useState(DEFAULT_START)
  const [simHour, setSimHour] = useState(0)

  const [activeSection, setActiveSection] = useState('orbital')

  // Global filters — only Time Series/Phase Space respect the severity/
  // numeric-range/resolution filters (via `filteredData` below). Seasonal
  // Pattern and Threat Escalation follow the DATE RANGE only (they aggregate
  // raw hours server-side), and the Orbital Simulator follows its own
  // date/hour. Orbit-shell visibility is V5-local state, not a global filter.
  const [filters, setFilters] = useState(DEFAULT_FILTERS)

  const filteredData = useMemo(() => {
    const filtered = applyGlobalFilters(data, filters, stormCatalog)
    return filters.resolution === 'daily' ? aggregateDaily(filtered) : filtered
  }, [data, filters, stormCatalog])


  // Hourly↔daily switches change every row's timestamp format, which would
  // orphan a lasso selection (chip stays, ticks vanish) — clear it instead.
  useEffect(() => { setSelectedPoints([]) }, [filters.resolution])

  //--------------------------------------------------
  // Playback — sweeps a time cursor (playhead) hour by hour from the loaded
  // window's start to its end. The cursor is drawn by V1/V2 as a cheap
  // overlay (no full d3 redraw per tick), and the Orbital Simulator's
  // date/hour follow it, so "play" animates every panel together.
  //--------------------------------------------------
  const [playing, setPlaying] = useState(false)
  const [playSpeed, setPlaySpeed] = useState(1)
  const [playIdx, setPlayIdx] = useState(0)
  const playIdxRef = useRef(0)
  useEffect(() => { playIdxRef.current = playIdx }, [playIdx])

  useEffect(() => {
    if (!playing || !data.length) return
    const id = setInterval(() => {
      const next = playIdxRef.current + 1
      if (next >= data.length) { setPlaying(false); return }
      setPlayIdx(next)
      const dt = data[next].datetime
      setSimDate(dt.slice(0, 10))
      setSimHour(Number(dt.slice(11, 13)))
    }, Math.max(40, 350 / playSpeed))
    return () => clearInterval(id)
  }, [playing, playSpeed, data])

  // The dashboard's "current moment" — simDate/simHour is the single source
  // of truth (playback ticks write into it, so during playback this equals
  // data[playIdx].datetime). Always non-null, so the time cursor in
  // Time Series/Phase Space is ALWAYS visible whenever the moment falls
  // inside the loaded window — not only while playing.
  const playhead = `${simDate}T${String(simHour).padStart(2, '0')}:00:00`

  function togglePlay() {
    if (!data.length) return
    if (!playing && playIdx >= data.length - 1) setPlayIdx(0)  // replay from start
    setPlaying(p => !p)
  }

  function resetFilters() {
    setFilters(DEFAULT_FILTERS)
    setSelectedStorm(null)
    setPlaying(false)
    setPlayIdx(0)
    // Reset the dashboard's "current moment" too — it drives the time
    // cursor in the charts and the Orbital snapshot.
    setSimDate(DEFAULT_START)
    setSimHour(0)
    // Restore the default date window too — after a storm jump reframed the
    // window, a "Reset" that left the charts sitting on the storm's dates
    // looked like it did nothing.
    applyRange(DEFAULT_START, DEFAULT_END)
    // applyRange already clears the lasso selection.
  }

  // Picking a storm (the jump select or ◀▶ steps) drives this one path. If
  // the storm lies outside the loaded date window, the window is re-framed
  // to cover it — otherwise Time Series/Phase Space have nothing to
  // highlight and the pick looks like it silently did nothing (the single
  // biggest "selection doesn't reflect" complaint).
  const jumpToStorm = (storm) => {
    setSelectedStorm(storm)
    if (storm?.peak_time) {
      setSimDate(storm.peak_time.slice(0, 10))
      setSimHour(Number(storm.peak_time.slice(11, 13)))

      const s0 = storm.start.slice(0, 10)
      const s1 = storm.end.slice(0, 10)
      if (s0 < start || s1 > end) {
        applyRange(
          format(subDays(parseISO(s0), 3), 'yyyy-MM-dd'),
          format(addDays(parseISO(s1), 4), 'yyyy-MM-dd'),
        )
      }
    }
  }

  // ◀ STORM / STORM ▶ — step chronologically through the catalog (it's
  // built in time order). Anchor on the selected storm, else on the loaded
  // window's start, so stepping works even before anything is picked.
  const stepStorm = (dir) => {
    if (!stormCatalog.length) return
    const anchor = selectedStorm ? selectedStorm.start.slice(0, 10) : start
    const target = dir > 0
      ? stormCatalog.find(s => s.start.slice(0, 10) > anchor)
      : [...stormCatalog].reverse().find(s => s.start.slice(0, 10) < anchor)
    if (target) jumpToStorm(target)
  }

  // Every loaded-window change clears the lasso selection (points may fall
  // outside the new window) and rewinds/stops playback (the playhead indexes
  // into the loaded rows) — but never touches selectedStorm/simDate/simHour.
  const applyRange = (newStart, newEnd) => {
    setStart(newStart)
    setEnd(newEnd)
    setDraftStart(newStart)
    setDraftEnd(newEnd)
    setSelectedPoints([])
    setPlaying(false)
    setPlayIdx(0)
  }

  // Esc anywhere clears the most recent cross-view selection: the lasso
  // first if one exists, otherwise the selected storm.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return
      if (selectedPoints.length) setSelectedPoints([])
      else if (selectedStorm) setSelectedStorm(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedPoints.length, selectedStorm])

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
        return <V1 data={filteredData} loading={loading} setDraftStart={setDraftStart} setDraftEnd={setDraftEnd} selectedPoints={selectedPoints} selectedStorm={selectedStorm} playhead={playhead} stormCatalog={stormCatalog} />
      case 'phasespace':
        return <V2 data={filteredData} loading={loading} selectedPoints={selectedPoints} onSelectPoints={setSelectedPoints} selectedStorm={selectedStorm} playhead={playhead} />
      case 'orbital':
        return <V5 simDate={simDate} simHour={simHour} setSimDate={setSimDate} setSimHour={setSimHour} />
      case 'seasonal':
        return <SeasonalPattern start={start} end={end} />
      case 'escalation':
        return <ThreatEscalation start={start} end={end} />
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
          stormCatalog={stormCatalog}
          selectedStorm={selectedStorm}
          onSelectStorm={jumpToStorm}
          playing={playing}
          onTogglePlay={togglePlay}
          playSpeed={playSpeed}
          setPlaySpeed={setPlaySpeed}
          onPrevStorm={() => stepStorm(-1)}
          onNextStorm={() => stepStorm(1)}
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

      {/* Active cross-visual selections — always visible regardless of which
          view is open, so a lasso or storm pick made in one view doesn't
          become invisible state the moment you switch to another. */}
      {(selectedStorm || selectedPoints.length > 0) && (
        <div className="flex-none flex items-center justify-center gap-2 px-4 py-1.5 border-b border-space-hairline text-[11px] font-mono">
          <span className="text-space-faint">Linked selections:</span>
          {selectedStorm && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-space-aurora/60 bg-space-aurora/10 text-space-aurora">
              ⚡ {selectedStorm.start.slice(0, 10)} · {selectedStorm.intensity} storm
              <button
                onClick={() => setSelectedStorm(null)}
                aria-label="Clear the selected storm"
                title="Clear the selected storm"
                className="hover:text-space-text leading-none"
              >
                ✕
              </button>
            </span>
          )}
          {selectedPoints.length > 0 && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-space-violet/60 bg-space-violet/10 text-violet-300">
              ◈ {selectedPoints.length} pts lassoed in Phase Space
              <button
                onClick={() => setSelectedPoints([])}
                aria-label="Clear the lassoed points"
                title="Clear the lassoed points"
                className="hover:text-space-text leading-none"
              >
                ✕
              </button>
            </span>
          )}
          <button
            onClick={() => { setSelectedStorm(null); setSelectedPoints([]) }}
            className="px-2 py-0.5 rounded border border-space-hairline text-space-dim hover:text-space-text hover:border-space-fast transition-colors"
          >
            Clear all
          </button>
          <span className="text-space-faint hidden lg:inline">(or press Esc)</span>
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
