import { useRef, useEffect, useState } from 'react'
import * as d3 from 'd3'

// Fixed domains (not d3.extent on the loaded window) so a given color always
// means the same physical value regardless of zoom level — the whole point
// of a spectrogram meant to be compared across different time windows.
const ROWS = [
  {
    key:   'bz_gsm_nT',
    label: 'IMF Bz',
    unit:  'nT',
    // clipped to ±15 nT — a diverging scale with a fixed, physically
    // meaningful range instead of stretching to whatever this window's max is
    colorFn: (val) => {
      const clipped = Math.max(-15, Math.min(15, val))
      return d3.interpolateRdBu((clipped + 15) / 30)
    },
  },
  {
    key:   'flow_speed_kms',
    label: 'SW Speed',
    unit:  'km/s',
    colorFn: (val) => d3.interpolateViridis(Math.max(0, Math.min(1, (val - 250) / (800 - 250)))),
  },
  {
    key:   'proton_density_ncc',
    label: 'Density',
    unit:  'n/cc',
    colorFn: (val) => d3.interpolateViridis(Math.max(0, Math.min(1, val / 30))),
  },
  {
    key:   'kp',
    label: 'Kp index',
    unit:  '0–9',
    colorFn: (val) => d3.interpolateViridis(Math.max(0, Math.min(1, val / 9))),
  },
]

// Legend domains matching colorFn, for the mini colorbars.
const LEGEND_DOMAIN = {
  bz_gsm_nT: [-15, 15],
  flow_speed_kms: [250, 800],
  proton_density_ncc: [0, 30],
  kp: [0, 9],
}

const MARGIN = { top: 8, right: 24, bottom: 36, left: 64 }

// Both /api/data and /api/orbital/storms represent the same UTC instants,
// just formatted differently (no 'Z' suffix vs 'Z'-suffixed) — compare them
// as plain ISO strings, never via `new Date()`, which would parse one family
// as local time and the other as UTC and silently shift them apart.
const stripZ = s => (s.endsWith('Z') ? s.slice(0, -1) : s)

export default function V3({ data, loading, selectedPoints, stormCatalog, onSelectStorm, selectedStorm, playhead }) {
  const containerRef = useRef(null)
  const canvasRef    = useRef(null)
  const svgRef       = useRef(null)
  const chartRef     = useRef(null)

  const [sizeTick, setSizeTick] = useState(0)
  const [emptyData, setEmptyData] = useState(false)
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(() => setSizeTick(t => t + 1))
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!data?.length || !containerRef.current) return

    const totalW  = containerRef.current.clientWidth
    const availH  = containerRef.current.clientHeight || 252
    const ROW_H   = Math.max(24, (availH - MARGIN.top - MARGIN.bottom) / ROWS.length)
    const chartW  = totalW - MARGIN.left - MARGIN.right
    const chartH  = ROWS.length * ROW_H

    const parsed = data.map(d => ({ ...d, t: new Date(d.datetime) }))
    const xScale = d3.scaleTime()
      .domain(d3.extent(parsed, d => d.t))
      .range([0, chartW])

    // --- Canvas: pixel heatmap ---
    const canvas = canvasRef.current
    const dpr = window.devicePixelRatio || 1
    canvas.width  = chartW * dpr
    canvas.height = chartH * dpr
    canvas.style.width  = chartW + 'px'
    canvas.style.height = chartH + 'px'
    canvas.style.left   = MARGIN.left + 'px'
    canvas.style.top    = MARGIN.top + 'px'

    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, chartW, chartH)

    const colW = chartW / parsed.length

    let paintedCells = 0
    ROWS.forEach((row, ri) => {
      const rowTop = ri * ROW_H
      parsed.forEach((d, ci) => {
        const val = d[row.key]
        if (val == null) return
        paintedCells++
        ctx.fillStyle = row.colorFn(val)
        ctx.fillRect(ci * colW, rowTop, Math.max(1, Math.ceil(colW)), ROW_H - 1)
      })
    })
    setEmptyData(paintedCells === 0)

    // --- SVG overlay: axes, labels, storm bands, colorbars ---
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', totalW).attr('height', availH)

    // Row labels + units
    ROWS.forEach((row, ri) => {
      const cy = MARGIN.top + ri * ROW_H + ROW_H / 2
      svg.append('text')
        .attr('x', MARGIN.left - 6).attr('y', cy - 5)
        .attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
        .attr('fill', '#7C8496').attr('font-size', 10).attr('font-family', "'JetBrains Mono', monospace")
        .text(row.label)
      svg.append('text')
        .attr('x', MARGIN.left - 6).attr('y', cy + 8)
        .attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
        .attr('fill', '#4B5265').attr('font-size', 8).attr('font-family', "'JetBrains Mono', monospace")
        .text(`(${row.unit})`)
    })

    // Row dividers
    for (let ri = 1; ri < ROWS.length; ri++) {
      svg.append('line')
        .attr('x1', MARGIN.left).attr('x2', MARGIN.left + chartW)
        .attr('y1', MARGIN.top + ri * ROW_H).attr('y2', MARGIN.top + ri * ROW_H)
        .attr('stroke', '#1E2330').attr('stroke-width', 1)
    }

    // Storm intervals detected locally (contiguous storm_flag runs), each
    // paired with a clickable hit-rect matched against the richer catalog.
    const stormIntervals = []
    let inStorm = false, stormStartT = null, stormStartRaw = null
    parsed.forEach((d, i) => {
      if (d.storm_flag && !inStorm) { inStorm = true; stormStartT = d.t; stormStartRaw = d.datetime }
      if (!d.storm_flag && inStorm) {
        stormIntervals.push({ t0: stormStartT, t1: parsed[i - 1].t, raw0: stormStartRaw, raw1: parsed[i - 1].datetime })
        inStorm = false
      }
    })
    if (inStorm) {
      stormIntervals.push({ t0: stormStartT, t1: parsed[parsed.length - 1].t, raw0: stormStartRaw, raw1: parsed[parsed.length - 1].datetime })
    }

    // Visual outlines only here — the clickable hit-rects are added later,
    // layered on top of the generic hover rect, so clicks reach them instead
    // of being swallowed by the hover layer's pointer-events:all.
    const bandsG = svg.append('g')
    const clickableStorms = []
    stormIntervals.forEach(({ t0, t1, raw0, raw1 }) => {
      const x1 = MARGIN.left + xScale(t0), x2 = MARGIN.left + xScale(t1)
      const w = Math.max(1, x2 - x1)

      bandsG.append('rect')
        .attr('x', x1).attr('y', MARGIN.top)
        .attr('width', w).attr('height', chartH)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(239,68,68,0.55)')
        .attr('stroke-width', 1.2)

      const match = stormCatalog?.find(s => stripZ(s.start) <= raw1 && stripZ(s.end) >= raw0)
      if (match && onSelectStorm) clickableStorms.push({ x1, w, match })
    })

    // Selected-storm highlight — drawn directly from the catalog's own
    // [start,end] interval (clipped to the visible window), NOT by matching
    // against storm_flag runs — the two storm definitions don't always
    // overlap, and requiring a match made a picked storm silently fail to
    // highlight. A marker triangle in the margin below stays legible even
    // where the heatmap's own colors would drown the translucent overlay.
    if (selectedStorm) {
      const selT0 = new Date(stripZ(selectedStorm.start))
      const selT1 = new Date(stripZ(selectedStorm.end))
      const [dom0, dom1] = xScale.domain()
      if (selT1 >= dom0 && selT0 <= dom1) {
        const px0 = MARGIN.left + xScale(selT0 < dom0 ? dom0 : selT0)
        const px1 = MARGIN.left + xScale(selT1 > dom1 ? dom1 : selT1)
        bandsG.append('rect')
          .attr('x', px0).attr('y', MARGIN.top)
          .attr('width', Math.max(2, px1 - px0)).attr('height', chartH)
          .attr('fill', 'rgba(67,217,200,0.25)')
          .attr('stroke', '#43D9C8').attr('stroke-width', 2)
        const midX = (px0 + px1) / 2
        const markerY = MARGIN.top + chartH + 3
        bandsG.append('path')
          .attr('d', `M${midX - 5},${markerY} L${midX + 5},${markerY} L${midX},${markerY - 6} Z`)
          .attr('fill', '#43D9C8')
      }
    }

    // Chart border
    svg.append('rect')
      .attr('x', MARGIN.left).attr('y', MARGIN.top)
      .attr('width', chartW).attr('height', chartH)
      .attr('fill', 'none').attr('stroke', '#1E2330').attr('stroke-width', 1)

    // X axis
    svg.append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top + chartH})`)
      .call(d3.axisBottom(xScale).ticks(Math.max(3, Math.round(chartW / 110))))
      .call(ax => ax.select('.domain').attr('stroke', '#1E2330'))
      .call(ax => ax.selectAll('.tick line').attr('stroke', '#1E2330'))
      .call(ax => ax.selectAll('.tick text').attr('fill', '#7C8496').attr('font-family', "'JetBrains Mono', monospace").attr('font-size', 10))

    // Selection strip: ISO timestamps lassoed in Phase Space — full-height
    // lines (matching Time Series), not 6px slivers at the very bottom that
    // were easy to miss entirely against the busy heatmap.
    if (selectedPoints?.length) {
      const selSet = new Set(selectedPoints)
      const stripG = svg.append('g')
      parsed.forEach(d => {
        if (!selSet.has(d.datetime)) return
        const px = MARGIN.left + xScale(d.t)
        stripG.append('line')
          .attr('x1', px).attr('x2', px)
          .attr('y1', MARGIN.top).attr('y2', MARGIN.top + chartH)
          .attr('stroke', '#8b5cf6').attr('stroke-width', 1.2).attr('stroke-opacity', 0.8)
      })
    }

    // Mini colorbars (right side)
    const barW = 6, barSteps = 20
    ROWS.forEach((row, ri) => {
      const dom    = LEGEND_DOMAIN[row.key]
      const barX   = MARGIN.left + chartW + 6
      const barTop = MARGIN.top + ri * ROW_H + 4
      const barH   = ROW_H - 8
      for (let s = 0; s < barSteps; s++) {
        const t   = s / (barSteps - 1)
        const val = dom[0] + t * (dom[1] - dom[0])
        svg.append('rect')
          .attr('x', barX)
          .attr('y', barTop + (barSteps - 1 - s) * (barH / barSteps))
          .attr('width', barW)
          .attr('height', Math.ceil(barH / barSteps) + 1)
          .attr('fill', row.colorFn(val))
      }
    })

    //--------------------------------------------------
    // Hover — local-only tooltip (no cross-panel cursor sync)
    //--------------------------------------------------

    const bisect = d3.bisector(d => d.t).center

    d3.select(containerRef.current).selectAll('div.v3-tooltip').remove()
    const tooltip = d3.select(containerRef.current)
      .append('div')
      .attr('class', 'v3-tooltip')
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('background', '#12151C')
      .style('border', '1px solid #252B3A')
      .style('border-radius', '6px')
      .style('padding', '8px')
      .style('font-family', "'JetBrains Mono', monospace")
      .style('font-size', '11px')
      .style('color', '#E7EAF0')
      .style('z-index', 10)
      .style('opacity', 0)

    // Invisible hit area for hover, covering the whole chart
    svg.append('rect')
      .attr('x', MARGIN.left)
      .attr('y', MARGIN.top)
      .attr('width', chartW)
      .attr('height', chartH)
      .attr('fill', 'transparent')
      .style('pointer-events', 'all')
      .style('cursor', 'crosshair')
      .on('mousemove', function (event) {
        const [mx] = d3.pointer(event, this)
        const date = xScale.invert(mx - MARGIN.left)
        const d = parsed[bisect(parsed, date)]
        if (!d) return

        tooltip
          .style('opacity', 1)
          .html(`
            <div style="font-weight:600;margin-bottom:6px;">
              ${d.t.toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
            </div>
            <hr style="border-color:#252B3A;margin:4px 0"/>
            IMF Bz : ${d.bz_gsm_nT?.toFixed(2) ?? '--'} nT<br/>
            SW Speed : ${d.flow_speed_kms?.toFixed(1) ?? '--'} km/s<br/>
            Density : ${d.proton_density_ncc?.toFixed(2) ?? '--'} n/cc<br/>
            Kp : ${d.kp ?? '--'}<br/>
            <br/>
            <b>Storm</b> : ${d.storm_flag ? '🔴 Yes' : '🟢 No'}
          `)

        const contEl = containerRef.current
        const node = tooltip.node()
        const tw = node.offsetWidth, th = node.offsetHeight
        let left = event.offsetX + 16
        let top = event.offsetY - th - 10
        if (left + tw > contEl.clientWidth) left = event.offsetX - tw - 16
        if (left < 4) left = 4
        if (top < 4) top = event.offsetY + 16
        if (top + th > contEl.clientHeight) top = contEl.clientHeight - th - 4
        tooltip.style('left', `${left}px`).style('top', `${top}px`)
      })
      .on('mouseout', () => {
        tooltip.style('opacity', 0)
      })

    // Storm click hit-rects — layered on top of the hover rect so clicks
    // reach them (mousemove over a storm band goes to the click rect instead
    // of the hover rect; losing the tooltip exactly there is an acceptable
    // trade for the red outline already marking it as a storm).
    clickableStorms.forEach(({ x1, w, match }) => {
      svg.append('rect')
        .attr('x', x1).attr('y', MARGIN.top)
        .attr('width', Math.max(6, w)).attr('height', chartH)
        .attr('fill', 'transparent')
        .style('cursor', 'pointer')
        .style('pointer-events', 'all')
        .on('click', () => onSelectStorm(match))
        .append('title')
        .text(`${match.intensity} storm · peak Dst ${match.peak_dst_nT} nT — click to open in Storm Analysis`)
    })

    // Playback cursor (orange) — moved by the small playhead effect below
    // without re-running this whole draw.
    const playLine = svg.append('line')
      .attr('y1', MARGIN.top).attr('y2', MARGIN.top + chartH)
      .attr('stroke', '#E8A33D').attr('stroke-width', 1.5)
      .style('display', 'none')

    chartRef.current = { xScale, playLine }

  }, [data, selectedPoints, stormCatalog, onSelectStorm, selectedStorm, sizeTick])

  useEffect(() => {
    const r = chartRef.current
    if (!r?.playLine) return
    if (!playhead) { r.playLine.style('display', 'none'); return }
    const t = new Date(playhead)
    const [d0, d1] = r.xScale.domain()
    if (t < d0 || t > d1) { r.playLine.style('display', 'none'); return }
    const px = MARGIN.left + r.xScale(t)
    r.playLine.style('display', null).attr('x1', px).attr('x2', px)
  }, [playhead, sizeTick, data])

  return (
    <div className="h-full flex flex-col bg-space-panel border border-space-hairline rounded-xl overflow-hidden">
      {/* Panel header */}
      <div className="flex-none flex items-center gap-2 px-4 py-2 border-b border-space-hairline bg-space-panel-2/60">
        <span className="text-sm font-semibold text-space-text" title="Fixed-domain parameter heatmap · red outline = storm period, click to inspect · violet ticks = points lassoed in Phase Space">Event Spectrogram</span>
      </div>

      {/* Chart area — no horizontal padding so clientWidth = coordinate space width */}
      <div ref={containerRef} className="relative w-full flex-1 min-h-0 overflow-hidden">
        {!data?.length
          ? <div className="flex items-center justify-center h-full text-space-faint text-sm font-mono">
              {loading ? 'Loading…' : 'No records in this date range — adjust Date Range above.'}
            </div>
          : <>
              <canvas ref={canvasRef} style={{ position: 'absolute' }} />
              <svg ref={svgRef} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', display: 'block' }} />
              {emptyData && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-space-faint text-sm font-mono text-center px-6">
                    No data matches the current filters in this range.
                  </span>
                </div>
              )}
            </>
        }
      </div>
    </div>
  )
}
