import { useRef, useEffect } from 'react'
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

const ROW_H  = 52
const MARGIN = { top: 8, right: 28, bottom: 36, left: 90 }
const TOTAL_H = MARGIN.top + ROWS.length * ROW_H + MARGIN.bottom  // 252px

export default function V3({ data }) {
  const containerRef = useRef(null)
  const canvasRef    = useRef(null)
  const svgRef       = useRef(null)

  useEffect(() => {
    if (!data?.length || !containerRef.current) return

    const totalW  = containerRef.current.clientWidth
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
    svg.attr('width', totalW).attr('height', TOTAL_H)

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
  }, [data])

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 bg-slate-900/60">
        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-indigo-400 tracking-wider">V3</span>
        <span className="text-sm font-semibold text-slate-200">Event Spectrogram</span>
        <span className="hidden sm:block text-[10px] text-slate-500 ml-auto">
          Color-encoded parameter heatmap · red outlines = storm periods
        </span>
      </div>

      {/* Chart area — no horizontal padding so clientWidth = coordinate space width */}
      <div ref={containerRef} className="relative w-full" style={{ height: TOTAL_H }}>
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
