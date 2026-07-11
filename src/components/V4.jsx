import { useState, useEffect, useRef, useMemo } from "react"
import * as d3 from "d3"
import { fetchWindow } from "../utils/fetchWindow"
import { pearson } from "../utils/stats"

// Four stacked small multiples on a shared "hours from shock" x-axis.
const CHARTS = [
  { key: 'bz_gsm_nT',         label: 'Bz',    unit: 'nT',   color: '#f87171', signed: true  },
  { key: 'flow_speed_kms',    label: 'Speed', unit: 'km/s', color: '#4ade80', signed: false },
  { key: 'pdyn_computed_nPa', label: 'Pdyn',  unit: 'nPa',  color: '#fbbf24', signed: false },
  { key: 'dst_omni',          label: 'Dst',   unit: 'nT',   color: '#38bdf8', signed: true  },
]
const CHART_GAP = 10
const MARGIN = { top: 8, right: 16, bottom: 30, left: 46 }
const DISPLAY_BEFORE = 12   // hours shown before the detected shock
const DISPLAY_AFTER  = 72   // hours shown after
const SHOCK_LOOKBACK = 48   // how far back to search for the steepest Pdyn rise

// Both /api/data and /api/orbital/storms represent the same UTC instants,
// just formatted differently — compare as plain strings, never via `new Date()`.
const stripZ = s => (s.endsWith('Z') ? s.slice(0, -1) : s)

function addDaysISO(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Steepest positive hourly ΔPdyn in the `lookback` hours before `peakIdx`
// (the SYM-H/Dst minimum) — skips any pair straddling a data gap.
function findShockIndex(series, peakIdx, lookback) {
  let best = -Infinity, idx = null
  const from = Math.max(1, peakIdx - lookback)
  for (let i = from; i <= peakIdx; i++) {
    const a = series[i - 1].pdyn_computed_nPa, b = series[i].pdyn_computed_nPa
    if (a == null || b == null) continue
    if (b - a > best) { best = b - a; idx = i }
  }
  return idx ?? peakIdx
}

// Fetch a storm's detail window, auto-detect its shock arrival, and trim to
// a fixed-length display window re-indexed so `i` is directly "hours from
// shock" (…so drawing never needs a separate shift/offset term).
async function loadStormDetail(storm) {
  const startPad = addDaysISO(stripZ(storm.start).slice(0, 10), -1)
  const endPad = addDaysISO(stripZ(storm.end).slice(0, 10), 5)
  const rows = await fetchWindow(startPad, endPad)
  const series = rows.map((r, i) => ({ ...r, i, t: new Date(r.datetime) }))
  if (!series.length) return null

  const peakRaw = stripZ(storm.peak_time)
  let peakIdx = series.findIndex(r => r.datetime === peakRaw)
  if (peakIdx === -1) {
    const peakDate = new Date(peakRaw)
    let best = 0, bestDiff = Infinity
    series.forEach((r, i) => { const diff = Math.abs(r.t - peakDate); if (diff < bestDiff) { bestDiff = diff; best = i } })
    peakIdx = best
  }

  const shockIdx = findShockIndex(series, peakIdx, SHOCK_LOOKBACK)
  const from = Math.max(0, shockIdx - DISPLAY_BEFORE)
  const to = Math.min(series.length - 1, shockIdx + DISPLAY_AFTER)
  const windowed = series.slice(from, to + 1).map((r, k) => ({ ...r, i: from + k - shockIdx }))

  return { storm, series: windowed }
}

function stormLabel(s) {
  return `${s.start.slice(0, 10)} · ${s.intensity} · Dst ${Math.round(s.peak_dst_nT)} nT`
}

export default function V4({ stormCatalog, selectedStorm, onSelectStorm }) {
  const svgRef = useRef(null)
  const wrapRef = useRef(null)

  // No separate "which storm is main" state: every path that changes it (a
  // V3 band click, or V4's own select below) goes through `onSelectStorm`,
  // which updates the parent's `selectedStorm` — that prop IS the source of
  // truth, so it's derived here rather than synced into a duplicate state.
  const mainId = selectedStorm ? String(selectedStorm.id) : ''
  const [cmpId, setCmpId] = useState('')
  const [mainData, setMainData] = useState(null)
  const [cmpData, setCmpData] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [lag, setLag] = useState(0)

  const sortedCatalog = useMemo(() => {
    const rank = { severe: 0, intense: 1, moderate: 2 }
    return [...(stormCatalog || [])].sort((a, b) =>
      (rank[a.intensity] ?? 3) - (rank[b.intensity] ?? 3) || a.peak_dst_nT - b.peak_dst_nT)
  }, [stormCatalog])

  useEffect(() => {
    if (!selectedStorm) { setMainData(null); return }
    let cancelled = false
    setLoadError(null)
    loadStormDetail(selectedStorm)
      .then(d => { if (!cancelled) setMainData(d) })
      .catch(e => { if (!cancelled) { setMainData(null); setLoadError(String(e)) } })
    return () => { cancelled = true }
  }, [selectedStorm])

  useEffect(() => {
    const storm = sortedCatalog.find(s => String(s.id) === cmpId)
    if (!storm) { setCmpData(null); return }
    let cancelled = false
    loadStormDetail(storm).then(d => { if (!cancelled) setCmpData(d) }).catch(() => { if (!cancelled) setCmpData(null) })
    return () => { cancelled = true }
  }, [cmpId, sortedCatalog])

  function handleMainChange(id) {
    const storm = sortedCatalog.find(s => String(s.id) === id)
    if (onSelectStorm) onSelectStorm(storm || null)
  }

  // Client-side Pearson correlation, Bz(t) vs Dst(t+lag), over the main
  // storm's display window — `series` is contiguous by construction (a
  // slice of hourly rows), so index+lag is a direct array offset.
  const corr = useMemo(() => {
    if (!mainData) return null
    const { series } = mainData
    const bz = [], dst = []
    for (let k = 0; k + lag < series.length; k++) {
      bz.push(series[k].bz_gsm_nT)
      dst.push(series[k + lag].dst_omni)
    }
    return pearson(bz, dst)
  }, [mainData, lag])

  const [sizeTick, setSizeTick] = useState(0)
  useEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver(() => setSizeTick(t => t + 1))
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!mainData || !wrapRef.current) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = wrapRef.current.clientWidth || 620
    const availH = wrapRef.current.clientHeight || 320
    const iw = width - MARGIN.left - MARGIN.right
    const CH_H = Math.max(30, (availH - MARGIN.top - MARGIN.bottom - (CHARTS.length - 1) * CHART_GAP) / CHARTS.length)
    const H = CHARTS.length * (CH_H + CHART_GAP) - CHART_GAP

    svg.attr('width', width).attr('height', availH)
    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    const iExt = d3.extent(mainData.series, d => d.i)
    const x = d3.scaleLinear().domain(iExt).range([0, iw])

    const chartYScales = []
    CHARTS.forEach((c, ci) => {
      const top = ci * (CH_H + CHART_GAP)
      const cg = g.append('g').attr('transform', `translate(0,${top})`)

      const vals = mainData.series.map(r => r[c.key])
        .concat(cmpData ? cmpData.series.map(r => r[c.key]) : [])
        .filter(v => v != null)
      let [lo, hi] = vals.length ? d3.extent(vals) : [0, 1]
      if (lo === hi) { lo -= 1; hi += 1 }
      const pad = (hi - lo) * 0.08
      const y = d3.scaleLinear().domain([lo - pad, hi + pad]).range([CH_H, 0])
      chartYScales.push(y)

      // Grid
      cg.append('g')
        .selectAll('line').data(y.ticks(3)).join('line')
        .attr('x1', 0).attr('x2', iw).attr('y1', d => y(d)).attr('y2', d => y(d))
        .attr('stroke', '#1E2330').attr('stroke-width', 1)

      cg.append('g')
        .call(d3.axisLeft(y).ticks(3).tickSize(4))
        .call(ax => ax.select('.domain').remove())
        .call(ax => ax.selectAll('.tick line').attr('stroke', '#252B3A'))
        .call(ax => ax.selectAll('.tick text').attr('fill', '#7C8496').attr('font-family', "'JetBrains Mono', monospace").attr('font-size', 9))

      cg.append('text')
        .attr('x', 4).attr('y', 9)
        .attr('fill', c.color).attr('font-size', 10).attr('font-family', "'JetBrains Mono', monospace")
        .text(`${c.label} (${c.unit})`)

      if (c.signed && lo < 0 && hi > 0) {
        cg.append('line')
          .attr('x1', 0).attr('x2', iw).attr('y1', y(0)).attr('y2', y(0))
          .attr('stroke', '#252B3A').attr('stroke-dasharray', '4,3')
      }

      const line = d3.line().defined(d => d[c.key] != null).x(d => x(d.i)).y(d => y(d[c.key]))

      // Comparison overlay drawn first (underneath), independently aligned at ITS OWN shock
      if (cmpData) {
        cg.append('path')
          .datum(cmpData.series)
          .attr('fill', 'none').attr('stroke', '#94a3b8').attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '6 4')
          .attr('d', line)
      }

      cg.append('path')
        .datum(mainData.series)
        .attr('fill', 'none').attr('stroke', c.color).attr('stroke-width', 2)
        .attr('d', line)

      // Shock-arrival rule at i = 0
      cg.append('line')
        .attr('x1', x(0)).attr('x2', x(0)).attr('y1', 0).attr('y2', CH_H)
        .attr('stroke', '#8b5cf6').attr('stroke-width', 1.5)
    })

    // Shared bottom axis: hours from shock
    const axisY = CHARTS.length * (CH_H + CHART_GAP) - CHART_GAP
    g.append('g')
      .attr('transform', `translate(0,${axisY + 4})`)
      .call(d3.axisBottom(x).ticks(8).tickFormat(d => (d > 0 ? '+' : '') + d))
      .call(ax => ax.select('.domain').attr('stroke', '#252B3A'))
      .call(ax => ax.selectAll('.tick line').attr('stroke', '#252B3A'))
      .call(ax => ax.selectAll('.tick text').attr('fill', '#7C8496').attr('font-family', "'JetBrains Mono', monospace").attr('font-size', 9))

    g.append('text')
      .attr('x', iw).attr('y', axisY + 24)
      .attr('text-anchor', 'end').attr('fill', '#4B5265').attr('font-size', 9).attr('font-family', "'JetBrains Mono', monospace")
      .text('hours from shock arrival')

    if (cmpData) {
      g.append('text')
        .attr('x', iw).attr('y', -2)
        .attr('text-anchor', 'end').attr('fill', '#7C8496').attr('font-size', 9).attr('font-family', "'JetBrains Mono', monospace")
        .text(`dashed: ${cmpData.storm.start.slice(0, 10)} (aligned at its own shock)`)
    }

    //--------------------------------------------------
    // Crosshair + exact-value tooltip (incl. AE), local hover only
    //--------------------------------------------------
    const tooltip = d3.select(wrapRef.current).selectAll('div.v4-tooltip').data([null]).join('div')
      .attr('class', 'v4-tooltip')
      .style('position', 'absolute').style('pointer-events', 'none')
      .style('background', '#12151C').style('border', '1px solid #252B3A').style('border-radius', '6px')
      .style('padding', '8px').style('font-family', "'JetBrains Mono', monospace").style('font-size', '11px')
      .style('color', '#E7EAF0').style('opacity', 0).style('z-index', 10)

    const cross = g.append('line')
      .attr('y1', 0).attr('y2', axisY)
      .attr('stroke', '#4B5265').attr('stroke-width', 1)
      .style('display', 'none')

    svg.append('rect')
      .attr('x', MARGIN.left).attr('y', MARGIN.top)
      .attr('width', iw).attr('height', H)
      .attr('fill', 'transparent').style('cursor', 'crosshair')
      .on('mousemove', function (event) {
        const [mx] = d3.pointer(event, this)
        const iVal = Math.round(x.invert(mx))
        const row = mainData.series.find(r => r.i === iVal)
        if (!row) { cross.style('display', 'none'); tooltip.style('opacity', 0); return }

        cross.style('display', null).attr('x1', x(row.i)).attr('x2', x(row.i))

        tooltip.style('opacity', 1).html(`
          <div style="font-weight:600;margin-bottom:6px;">
            ${row.t.toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
            <span style="color:#7C8496">(${row.i >= 0 ? '+' : ''}${row.i} h)</span>
          </div>
          <hr style="border-color:#252B3A;margin:4px 0"/>
          Bz : ${row.bz_gsm_nT?.toFixed(2) ?? '--'} nT<br/>
          Speed : ${row.flow_speed_kms?.toFixed(0) ?? '--'} km/s<br/>
          Pdyn : ${row.pdyn_computed_nPa?.toFixed(2) ?? '--'} nPa<br/>
          Dst : ${row.dst_omni?.toFixed(0) ?? '--'} nT<br/>
          AE : ${row.ae_index_nT?.toFixed(0) ?? '--'} nT
        `)

        const wrapEl = wrapRef.current
        const node = tooltip.node()
        const tw = node.offsetWidth, th = node.offsetHeight
        let left = event.offsetX + 16
        let top = event.offsetY - th - 10
        if (left + tw > wrapEl.clientWidth) left = event.offsetX - tw - 16
        if (left < 4) left = 4
        if (top < 4) top = event.offsetY + 16
        if (top + th > wrapEl.clientHeight) top = wrapEl.clientHeight - th - 4
        tooltip.style('left', `${left}px`).style('top', `${top}px`)
      })
      .on('mouseleave', () => { cross.style('display', 'none'); tooltip.style('opacity', 0) })

  }, [mainData, cmpData, sizeTick])

  const metrics = useMemo(() => {
    if (!mainData) return null
    const vals = k => mainData.series.map(r => r[k]).filter(v => v != null)
    return {
      maxPdyn: Math.max(...vals('pdyn_computed_nPa')),
      minBz:   Math.min(...vals('bz_gsm_nT')),
      minDst:  Math.min(...vals('dst_omni')),
    }
  }, [mainData])

  return (
    <div className="h-full flex flex-col bg-space-panel border border-space-hairline rounded-xl overflow-hidden">
      {/* Header: title + pickers */}
      <div className="flex-none flex items-center gap-2 px-3 py-1.5 border-b border-space-hairline bg-space-panel-2/60 flex-wrap">
        <span className="text-sm font-semibold text-space-text" title="Auto-detected shock arrival · lag slider drives a live Bz→Dst correlation">
          Storm Inspector
        </span>
        <select
          value={mainId}
          onChange={e => handleMainChange(e.target.value)}
          className="ml-auto bg-space-panel-2 border border-space-hairline rounded px-2 py-0.5 text-[10px] font-mono text-space-dim max-w-[45%]"
        >
          <option value="">— choose a storm —</option>
          {sortedCatalog.map(s => <option key={s.id} value={s.id}>{stormLabel(s)}</option>)}
        </select>
        <select
          value={cmpId}
          onChange={e => setCmpId(e.target.value)}
          className="bg-space-panel-2 border border-space-hairline rounded px-2 py-0.5 text-[10px] font-mono text-space-dim max-w-[35%]"
        >
          <option value="">no comparison</option>
          {sortedCatalog.map(s => <option key={s.id} value={s.id}>{stormLabel(s)}</option>)}
        </select>
      </div>

      {/* Lag slider + correlation readout + metrics — one compact row */}
      {mainData && (
        <div className="flex-none flex items-center gap-3 px-3 py-1.5 border-b border-space-hairline text-[10px] font-mono flex-wrap">
          <span className="text-space-dim">Bz→Dst lag</span>
          <input
            type="range" min="0" max="6" step="1" value={lag}
            onChange={e => setLag(Number(e.target.value))}
            className="w-24 accent-space-violet"
          />
          <span className="text-space-text">{lag} h</span>
          <span className="text-space-dim">
            r = <b className="text-space-text">{corr?.r != null ? corr.r.toFixed(2) : '—'}</b>
            {corr && <span className="text-space-faint"> ({corr.n} pairs)</span>}
          </span>
          {metrics && (
            <span className="ml-auto flex items-center gap-3">
              <span className="text-space-dim">Max Pdyn <b className="text-yellow-400">{metrics.maxPdyn.toFixed(1)}</b></span>
              <span className="text-space-dim">Min Bz <b className="text-red-400">{metrics.minBz.toFixed(1)}</b></span>
              <span className="text-space-dim">Min Dst <b className="text-sky-400">{metrics.minDst.toFixed(0)}</b></span>
            </span>
          )}
        </div>
      )}

      {/* Chart */}
      <div ref={wrapRef} className="flex-1 min-h-0 relative bg-space-panel-2 overflow-hidden">
        {!mainData ? (
          <div className="flex items-center justify-center h-full text-space-faint text-xs font-mono text-center px-6">
            {loadError ? `Could not load storm: ${loadError}` : 'Choose a storm above, or click a storm band in the Event Spectrogram.'}
          </div>
        ) : (
          <svg ref={svgRef} style={{ display: 'block' }} />
        )}
      </div>
    </div>
  )
}
