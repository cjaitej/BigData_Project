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

  const zoomIn = () => {

  const s = parseISO(start)
  const e = parseISO(end)

  const days = differenceInDays(e, s)

  if (days <= MIN_RANGE_DAYS) return

  const newDays = Math.max(MIN_RANGE_DAYS, Math.floor(days / 2))

  const center = new Date((s.getTime() + e.getTime()) / 2)

  const newStart = subDays(center, Math.floor(newDays / 2))
  const newEnd = addDays(center, Math.ceil(newDays / 2))

  setStart(format(newStart, "yyyy-MM-dd"))
  setEnd(format(newEnd, "yyyy-MM-dd"))
  setDraftStart(format(newStart, "yyyy-MM-dd"))
  setDraftEnd(format(newEnd, "yyyy-MM-dd"))
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

  setStart(format(newStart, "yyyy-MM-dd"))
  setEnd(format(newEnd, "yyyy-MM-dd"))
  setDraftStart(format(newStart, "yyyy-MM-dd"))
  setDraftEnd(format(newEnd, "yyyy-MM-dd"))
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

  setStart(format(newStart, "yyyy-MM-dd"))
  setEnd(format(newEnd, "yyyy-MM-dd"))
  setDraftStart(format(newStart, "yyyy-MM-dd"))
  setDraftEnd(format(newEnd, "yyyy-MM-dd"))
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

  setStart(format(newStart, "yyyy-MM-dd"))
  setEnd(format(newEnd, "yyyy-MM-dd"))
  setDraftStart(format(newStart, "yyyy-MM-dd"))
  setDraftEnd(format(newEnd, "yyyy-MM-dd"))
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
    <div className="min-h-screen bg-[#030712] text-slate-300 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-6 py-4">
        <div className="max-w-screen-2xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-slate-100 tracking-tight">
                Solar Wind &amp; Space Weather Analytics
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                CS661 · Group 21 · NASA OMNI High-Resolution Database (1-min, time-shifted to bow shock)
              </p>
            </div>

            {/* Date range controls */}
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1.5 text-xs text-slate-400">
                Start
                <input
                  type="date"
                  value={draftStart}
                  min="1995-01-01"
                  max={draftEnd}
                  onChange={e => setDraftStart(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-400">
                End
                <input
                      type="date"
                      value={draftEnd}
                      min={draftStart}
                      onChange={e => setDraftEnd(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                />
              </label>
              <button
                  onClick={() => {

                      setStart(draftStart)
                      setEnd(draftEnd)

                  }}
                disabled={loading}
                className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs text-white font-medium transition-colors"
              >
                {loading ? 'Loading…' : 'Apply'}
              </button>

              <div className="flex items-center gap-1 ml-2">

              <button
                onClick={panLeft}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs"
              >
                ◀
              </button>

              <button
                onClick={zoomOut}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs"
              >
                −
              </button>

              <button
                onClick={zoomIn}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs"
              >
                +
              </button>

              <button
                onClick={panRight}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs"
              >
                ▶
              </button>

            </div>


              {/* Quick presets */}
              <div className="flex items-center gap-1 ml-1">
                {[
                  { label: 'Halloween 2003', start: '2003-10-25', end: '2003-11-10' },
                  { label: 'St. Patrick 2015', start: '2015-03-14', end: '2015-03-22' },
                ].map(p => (
                  <button
                    key={p.label}
                    onClick={() => { setStart(p.start); setEnd(p.end) }}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Status bar */}
          <div className="flex items-center gap-3 mt-2">
            {loading && (
              <div className="flex items-center gap-1.5 text-xs text-indigo-400">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                Fetching…
              </div>
            )}
            {error && (
              <p className="text-xs text-red-400">
                API error: {error} — is the Flask server running on port 5000?
              </p>
            )}
            {!loading && !error && data.length > 0 && (
              <p className="text-xs text-slate-500">
                {data.length.toLocaleString()} hourly records · {start} → {end}
              </p>
            )}
          </div>
        </div>
      </header>

      {/* Loading progress bar */}
      {loading && (
        <div className="h-0.5 bg-slate-800">
          <div className="h-full bg-indigo-500 animate-pulse" style={{ width: '60%' }} />
        </div>
      )}

      {/* Panels */}
      <main className="max-w-screen-2xl mx-auto px-4 py-4 flex flex-col gap-4">
        <V1 data={data} setDraftStart={setDraftStart} setDraftEnd={setDraftEnd}/>
        <V3 data={data} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <V2 data = {data}/>
          <V4 />
        </div>
        <V5 />
      </main>
    </div>
  )
}
