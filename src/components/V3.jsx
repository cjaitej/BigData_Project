import { useRef, useEffect, useState } from 'react'
import * as d3 from 'd3'

const ROWS = [
  {
    key:   'bz_gsm_nT',
    label: 'IMF Bz',
    unit:  'nT',
    colorFn: (val, ext) => {
      const absMax = Math.max(Math.abs(ext[0] ?? 0), Math.abs(ext[1] ?? 0)) || 30
      const t = (val + absMax) / (2 * absMax)
      return d3.interpolateRdBu(Math.max(0, Math.min(1, t)))
    },
  },
  {
    key:   'flow_speed_kms',
    label: 'SW Speed',
    unit:  'km/s',
    colorFn: (val, ext) => {
      const span = (ext[1] - ext[0]) || 1
      return d3.interpolateViridis(Math.max(0, Math.min(1, (val - ext[0]) / span)))
    },
  },
  {
    key:   'proton_density_ncc',
    label: 'Density',
    unit:  'n/cc',
    colorFn: (val, ext) => {
      const span = (ext[1] - ext[0]) || 1
      return d3.interpolatePlasma(Math.max(0, Math.min(1, (val - ext[0]) / span)))
    },
  },
  {
    key:   'kp',
    label: 'Kp index',
    unit:  '0–9',
    colorFn: (val) => d3.interpolateYlOrRd(Math.max(0, Math.min(1, val / 9))),
  },
]

const MARGIN = { top: 8, right: 28, bottom: 36, left: 90 }

export default function V3({ data, hoverTime, setHoverTime, selection }) {
  const containerRef = useRef(null)
  const canvasRef    = useRef(null)
  const svgRef       = useRef(null)
  const chartRef     = useRef(null)   // scales + hover elements for the linked-view effects

  // Redraw when the grid cell resizes — row height follows the container
  const [sizeTick, setSizeTick] = useState(0)
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

    const extents = {}
    ROWS.forEach(row => { extents[row.key] = d3.extent(data, d => d[row.key]) })

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

    ROWS.forEach((row, ri) => {
      const ext = extents[row.key]
      const rowTop = ri * ROW_H
      parsed.forEach((d, ci) => {
        const val = d[row.key]
        if (val == null) return
        ctx.fillStyle = row.colorFn(val, ext)
        ctx.fillRect(ci * colW, rowTop, Math.max(1, Math.ceil(colW)), ROW_H - 1)
      })
    })

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
        .attr('fill', '#94a3b8').attr('font-size', 10).attr('font-family', 'ui-monospace, monospace')
        .text(row.label)
      svg.append('text')
        .attr('x', MARGIN.left - 6).attr('y', cy + 8)
        .attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
        .attr('fill', '#475569').attr('font-size', 8).attr('font-family', 'ui-monospace, monospace')
        .text(`(${row.unit})`)
    })

    // Row dividers
    for (let ri = 1; ri < ROWS.length; ri++) {
      svg.append('line')
        .attr('x1', MARGIN.left).attr('x2', MARGIN.left + chartW)
        .attr('y1', MARGIN.top + ri * ROW_H).attr('y2', MARGIN.top + ri * ROW_H)
        .attr('stroke', '#1e293b').attr('stroke-width', 1)
    }

    // Storm band outlines
    let inStorm = false, stormStart = null
    parsed.forEach((d, i) => {
      if (d.storm_flag && !inStorm) { inStorm = true; stormStart = d.t }
      if (!d.storm_flag && inStorm) {
        const x1 = xScale(stormStart), x2 = xScale(parsed[i - 1].t)
        svg.append('rect')
          .attr('x', MARGIN.left + x1).attr('y', MARGIN.top)
          .attr('width', Math.max(1, x2 - x1)).attr('height', chartH)
          .attr('fill', 'none').attr('stroke', 'rgba(239,68,68,0.85)').attr('stroke-width', 1.5)
        inStorm = false
      }
    })
    if (inStorm) {
      const x1 = xScale(stormStart), x2 = xScale(parsed[parsed.length - 1].t)
      svg.append('rect')
        .attr('x', MARGIN.left + x1).attr('y', MARGIN.top)
        .attr('width', Math.max(1, x2 - x1)).attr('height', chartH)
        .attr('fill', 'none').attr('stroke', 'rgba(239,68,68,0.85)').attr('stroke-width', 1.5)
    }

    // Chart border
    svg.append('rect')
      .attr('x', MARGIN.left).attr('y', MARGIN.top)
      .attr('width', chartW).attr('height', chartH)
      .attr('fill', 'none').attr('stroke', '#1e293b').attr('stroke-width', 1)

    // X axis
    svg.append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top + chartH})`)
      .call(d3.axisBottom(xScale).ticks(8))
      .call(ax => ax.select('.domain').attr('stroke', '#334155'))
      .call(ax => ax.selectAll('.tick line').attr('stroke', '#334155'))
      .call(ax => ax.selectAll('.tick text').attr('fill', '#64748b').attr('font-size', 10))

    // Mini colorbars (right side)
    const barW = 6, barSteps = 20
    ROWS.forEach((row, ri) => {
      const ext    = extents[row.key]
      const barX   = MARGIN.left + chartW + 6
      const barTop = MARGIN.top + ri * ROW_H + 4
      const barH   = ROW_H - 8
      for (let s = 0; s < barSteps; s++) {
        const t   = s / (barSteps - 1)
        const val = (ext[0] ?? 0) + t * ((ext[1] ?? 1) - (ext[0] ?? 0))
        svg.append('rect')
          .attr('x', barX)
          .attr('y', barTop + (barSteps - 1 - s) * (barH / barSteps))
          .attr('width', barW)
          .attr('height', Math.ceil(barH / barSteps) + 1)
          .attr('fill', row.colorFn(val, ext))
      }
    })

    //--------------------------------------------------
    // Hover + linked-view layer
    //--------------------------------------------------

    const bisect = d3.bisector(d => d.t).center

    // Persistent band showing the shared selection (drawn by the selection effect)
    const persistBand = svg.append('rect')
      .attr('y', MARGIN.top)
      .attr('height', chartH)
      .attr('fill', 'rgba(99,102,241,0.10)')
      .attr('stroke', '#6366f1')
      .attr('stroke-dasharray', '3,3')
      .style('display', 'none')

    // Cursor line driven by shared hoverTime
    const hoverLine = svg.append('line')
      .attr('y1', MARGIN.top)
      .attr('y2', MARGIN.top + chartH)
      .attr('stroke', '#e2e8f0')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4,3')
      .style('display', 'none')

    // Tooltip (recreate on each draw)
    d3.select(containerRef.current).selectAll('div.v3-tooltip').remove()
    const tooltip = d3.select(containerRef.current)
      .append('div')
      .attr('class', 'v3-tooltip')
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('background', '#0f172a')
      .style('border', '1px solid #334155')
      .style('border-radius', '6px')
      .style('padding', '8px')
      .style('font-size', '11px')
      .style('color', '#e2e8f0')
      .style('z-index', 10)
      .style('opacity', 0)

    // Invisible hit area — overrides the svg's pointer-events:none
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

        setHoverTime(d.t)

        tooltip
          .style('opacity', 1)
          .style('left', `${event.offsetX + 18}px`)
          .style('top', `${event.offsetY - 12}px`)
          .html(`
            <div style="font-weight:600;margin-bottom:6px;">
              ${d.t.toLocaleString()}
            </div>
            <hr style="border-color:#334155;margin:4px 0"/>
            IMF Bz : ${d.bz_gsm_nT?.toFixed(2) ?? '--'} nT<br/>
            SW Speed : ${d.flow_speed_kms?.toFixed(1) ?? '--'} km/s<br/>
            Density : ${d.proton_density_ncc?.toFixed(2) ?? '--'} n/cc<br/>
            Kp : ${d.kp ?? '--'}<br/>
            <br/>
            <b>Storm</b> : ${d.storm_flag ? '🔴 Yes' : '🟢 No'}
          `)
      })

      .on('mouseout', () => {
        setHoverTime(null)
        tooltip.style('opacity', 0)
      })

    chartRef.current = { xScale, parsed, bisect, hoverLine, persistBand }

  }, [data, sizeTick, setHoverTime])

  //--------------------------------------------------
  // Linked hover — cursor driven by shared hoverTime
  //--------------------------------------------------

  useEffect(() => {

    const c = chartRef.current
    if (!c) return

    const { xScale, parsed, bisect, hoverLine } = c

    // note: never return the d3 selection from the effect — React would
    // treat it as a cleanup function and crash
    const hide = () => { hoverLine.style('display', 'none') }

    if (!hoverTime || !parsed.length) return hide()

    const [d0, d1] = xScale.domain()
    if (hoverTime < d0 || hoverTime > d1) return hide()

    const d = parsed[bisect(parsed, hoverTime)]
    if (!d) return hide()

    const cx = MARGIN.left + xScale(d.t)
    hoverLine.style('display', null).attr('x1', cx).attr('x2', cx)

  }, [hoverTime, data])

  //--------------------------------------------------
  // Linked selection — persistent band for the
  // shared brushed range
  //--------------------------------------------------

  useEffect(() => {

    const c = chartRef.current
    if (!c) return

    const { xScale, persistBand } = c

    if (!selection) {
      persistBand.style('display', 'none')
      return
    }

    const [d0, d1] = xScale.domain()
    const s = Math.max(selection[0], d0)
    const e = Math.min(selection[1], d1)

    if (e <= s) {
      persistBand.style('display', 'none')
      return
    }

    persistBand
      .style('display', null)
      .attr('x', MARGIN.left + xScale(s))
      .attr('width', xScale(e) - xScale(s))

  }, [selection, data])

  return (
    <div className="h-full flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Panel header */}
      <div className="flex-none flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-900/60">
        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-indigo-400 tracking-wider">V3</span>
        <span className="text-sm font-semibold text-slate-200">Event Spectrogram</span>
        <span className="hidden sm:block text-[10px] text-slate-500 ml-auto">
          parameter heatmap · red outline = storm · hover syncs
        </span>
      </div>

      {/* Chart area — no horizontal padding so clientWidth = coordinate space width */}
      <div ref={containerRef} className="relative w-full flex-1 min-h-0 overflow-hidden">
        {!data?.length
          ? <div className="flex items-center justify-center h-full text-slate-500 text-sm">Waiting for data…</div>
          : <>
              <canvas ref={canvasRef} style={{ position: 'absolute' }} />
              <svg ref={svgRef} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', display: 'block' }} />
            </>
        }
      </div>
    </div>
  )
}
