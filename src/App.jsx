import { useState, useEffect, useCallback } from 'react'
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
import V4 from './components/V4'
import V5 from './components/V5'

const DEFAULT_START = '2003-10-25'
const DEFAULT_END   = '2003-11-10'
const DATASET_START = parseISO("1995-01-01")
const DATASET_END   = parseISO("2025-12-31")

const MAX_RANGE_DAYS = 365 * 2
const MIN_RANGE_DAYS = 2

export default function App() {
  const [data, setData]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [start, setStart]       = useState(DEFAULT_START)
  const [end, setEnd]           = useState(DEFAULT_END)
  const [draftStart, setDraftStart] = useState(DEFAULT_START)
  const [draftEnd, setDraftEnd] = useState(DEFAULT_END)

  // Linked-view state shared by V1 / V2 / V3
  const [hoverTime, setHoverTime] = useState(null)   // Date | null — synced cursor
  const [selection, setSelection] = useState(null)   // [Date, Date] | null — brushed range

  // Every range change goes through here so the linked cursor/brush reset too
  const applyRange = (newStart, newEnd) => {
    setStart(newStart)
    setEnd(newEnd)
    setDraftStart(newStart)
    setDraftEnd(newEnd)
    setHoverTime(null)
    setSelection(null)
  }

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

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-space-bg text-space-dim font-sans">
      {/* Compact single-row header — one strict baseline, uniform control heights */}
      <header className="flex-none border-b border-space-hairline bg-space-panel/90 px-4 py-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-sm font-bold text-space-text tracking-tight whitespace-nowrap leading-none">
            Solar Wind &amp; Space Weather Analytics
            <span className="hidden xl:inline ml-2 text-[10px] font-mono font-normal text-space-faint tracking-normal">
              CS661 · Group 21 · NASA OMNI
            </span>
          </h1>

          <div className="hidden sm:block h-5 w-px bg-space-hairline" />

          {/* Date range controls */}
          <div className="flex items-center gap-2 font-mono">
            <label className="flex items-center gap-1.5 text-xs text-space-dim">
              Start
              <input
                type="date"
                value={draftStart}
                min="1995-01-01"
                max={draftEnd}
                onChange={e => setDraftStart(e.target.value)}
                className="h-6 bg-space-panel-2 border border-space-hairline rounded px-2 text-space-text text-xs focus:outline-none focus:border-space-violet"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-space-dim">
              End
              <input
                type="date"
                value={draftEnd}
                min={draftStart}
                onChange={e => setDraftEnd(e.target.value)}
                className="h-6 bg-space-panel-2 border border-space-hairline rounded px-2 text-space-text text-xs focus:outline-none focus:border-space-violet"
              />
            </label>
            <button
              onClick={() => applyRange(draftStart, draftEnd)}
              disabled={loading}
              className="h-6 px-3 rounded bg-space-violet hover:bg-violet-500 disabled:opacity-50 text-xs text-white font-medium transition-colors"
            >
              {loading ? 'Loading…' : 'Apply'}
            </button>
          </div>

          <div className="hidden sm:block h-5 w-px bg-space-hairline" />

          {/* Pan / zoom */}
          <div className="flex items-center gap-1 font-mono">
            {[
              { label: '◀', fn: panLeft, hint: 'Pan left' },
              { label: '−', fn: zoomOut, hint: 'Zoom out' },
              { label: '+', fn: zoomIn, hint: 'Zoom in' },
              { label: '▶', fn: panRight, hint: 'Pan right' },
            ].map(b => (
              <button
                key={b.hint}
                onClick={b.fn}
                title={b.hint}
                className="h-6 w-6 flex items-center justify-center rounded bg-space-panel-2 border border-space-hairline text-xs text-space-dim hover:text-space-text hover:border-space-fast transition-colors"
              >
                {b.label}
              </button>
            ))}
          </div>

          <div className="hidden sm:block h-5 w-px bg-space-hairline" />

          {/* Quick presets */}
          <div className="flex items-center gap-1 font-mono">
            {[
              { label: 'Halloween 2003', start: '2003-10-25', end: '2003-11-10' },
              { label: 'St. Patrick 2015', start: '2015-03-14', end: '2015-03-22' },
            ].map(p => (
              <button
                key={p.label}
                onClick={() => applyRange(p.start, p.end)}
                className="h-6 px-2 flex items-center rounded bg-space-panel-2 hover:bg-space-panel border border-space-hairline text-[10px] text-space-dim hover:text-space-text transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

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

      {/* Loading progress bar — fixed-height slot so paging doesn't shift the layout */}
      <div className="flex-none h-0.5 bg-transparent">
        {loading && <div className="h-full bg-space-violet animate-pulse" style={{ width: '60%' }} />}
      </div>

      {/* Side-by-side: V5 (simulator + its own timeline/controls) on the left,
          the four analytical panels stacked full-width on the right — both
          stay visible at once, no toggling needed. V5's clock drives the
          right side. */}
      <main
        className="flex-1 min-h-0 grid gap-2 px-2 pb-2"
        style={{ gridTemplateColumns: 'minmax(0, 65fr) minmax(0, 35fr)' }}
      >
        <div className="min-h-0">
          <V5
            start={start}
            end={end}
            hoverTime={hoverTime}
            setHoverTime={setHoverTime}
            selection={selection}
            applyRange={applyRange}
          />
        </div>
        <div className="min-h-0 overflow-hidden grid grid-rows-4 gap-2">
          <div className="min-h-0 overflow-hidden">
            <V1
              data={data}
              setDraftStart={setDraftStart}
              setDraftEnd={setDraftEnd}
              hoverTime={hoverTime}
              setHoverTime={setHoverTime}
              selection={selection}
              setSelection={setSelection}
            />
          </div>
          <div className="min-h-0 overflow-hidden">
            <V3
              data={data}
              hoverTime={hoverTime}
              setHoverTime={setHoverTime}
              selection={selection}
            />
          </div>
          <div className="min-h-0 overflow-hidden">
            <V2
              data={data}
              hoverTime={hoverTime}
              setHoverTime={setHoverTime}
              selection={selection}
            />
          </div>
          <div className="min-h-0 overflow-hidden">
            <V4 data={data} />
          </div>
        </div>
      </main>
    </div>
  )
}
