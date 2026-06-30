import { useRef, useEffect } from 'react'
import * as d3 from 'd3'

const PANELS = [
  { key: 'flow_speed_kms',     label: 'SW Speed (km/s)', color: '#4ade80' },
  { key: 'proton_density_ncc', label: 'Density (n/cc)',  color: '#60a5fa' },
  { key: 'bz_gsm_nT',         label: 'IMF Bz (nT)',     color: '#f87171', zeroline: true },
  { key: 'pdyn_computed_nPa',  label: 'Pdyn (nPa)',      color: '#fbbf24' },
]

const MARGIN  = { top: 8, right: 20, bottom: 36, left: 82 }
const PANEL_H = 90
const PANEL_GAP = 5

export default function V1({ data }) {
  const svgRef  = useRef(null)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!data?.length || !svgRef.current || !wrapRef.current) return

    const totalW = wrapRef.current.clientWidth
    const W      = totalW - MARGIN.left - MARGIN.right
    const n      = PANELS.length
    const totalH = MARGIN.top + n * PANEL_H + (n - 1) * PANEL_GAP + MARGIN.bottom

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', totalW).attr('height', totalH)

    const parsed = data
      .filter(d => d.datetime)
      .map(d => ({ ...d, t: new Date(d.datetime) }))

    const xScale = d3.scaleTime()
      .domain(d3.extent(parsed, d => d.t))
      .range([0, W])

    // Detect contiguous storm intervals once
    const stormIntervals = []
    let inStorm = false, stormStart = null
    parsed.forEach((d, i) => {
      if (d.storm_flag && !inStorm) { inStorm = true; stormStart = d.t }
      if (!d.storm_flag && inStorm) {
        stormIntervals.push([stormStart, parsed[i - 1].t])
        inStorm = false
      }
    })
    if (inStorm) stormIntervals.push([stormStart, parsed[parsed.length - 1].t])

    PANELS.forEach((panel, i) => {
      const yTop = MARGIN.top + i * (PANEL_H + PANEL_GAP)
      const g    = svg.append('g').attr('transform', `translate(${MARGIN.left},${yTop})`)

      const vals = parsed.map(d => d[panel.key]).filter(v => v != null)
      if (!vals.length) return

      const [yMin, yMax] = d3.extent(vals)
      const pad = (yMax - yMin) * 0.08 || 1
      const yScale = d3.scaleLinear().domain([yMin - pad, yMax + pad]).range([PANEL_H, 0])

      // Panel background
      g.append('rect')
        .attr('width', W).attr('height', PANEL_H)
        .attr('fill', '#050d1a').attr('rx', 3)

      // Storm shading
      stormIntervals.forEach(([s, e]) => {
        g.append('rect')
          .attr('x', xScale(s)).attr('y', 0)
          .attr('width', Math.max(1, xScale(e) - xScale(s)))
          .attr('height', PANEL_H)
          .attr('fill', 'rgba(239,68,68,0.18)')
      })

      // Zero line (Bz only)
      if (panel.zeroline && yMin < 0 && yMax > 0) {
        const y0 = yScale(0)
        g.append('line')
          .attr('x1', 0).attr('x2', W).attr('y1', y0).attr('y2', y0)
          .attr('stroke', '#475569').attr('stroke-dasharray', '4,3').attr('stroke-width', 1)
      }

      // Grid lines
      g.append('g')
        .call(d3.axisLeft(yScale).ticks(3).tickSize(-W).tickFormat(''))
        .call(ax => ax.select('.domain').remove())
        .call(ax => ax.selectAll('.tick line').attr('stroke', '#0f1f35').attr('stroke-width', 1))

      // Line
      const line = d3.line()
        .defined(d => d[panel.key] != null)
        .x(d => xScale(d.t))
        .y(d => yScale(d[panel.key]))
        .curve(d3.curveLinear)

      g.append('path').datum(parsed)
        .attr('fill', 'none')
        .attr('stroke', panel.color)
        .attr('stroke-width', 1.2)
        .attr('d', line)

      // Y axis ticks
      g.append('g')
        .call(d3.axisLeft(yScale).ticks(3).tickSize(4))
        .call(ax => ax.select('.domain').remove())
        .call(ax => ax.selectAll('.tick line').attr('stroke', '#334155'))
        .call(ax => ax.selectAll('.tick text')
          .attr('fill', '#94a3b8').attr('font-size', 9).attr('dx', -2))

      // Row label (left of margin)
      svg.append('text')
        .attr('x', MARGIN.left - 6)
        .attr('y', yTop + PANEL_H / 2)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('fill', panel.color)
        .attr('font-size', 10)
        .attr('font-family', 'ui-monospace, monospace')
        .text(panel.label)
    })

    // Shared X axis
    const xAxisY = MARGIN.top + n * PANEL_H + (n - 1) * PANEL_GAP
    svg.append('g')
      .attr('transform', `translate(${MARGIN.left},${xAxisY})`)
      .call(d3.axisBottom(xScale).ticks(8))
      .call(ax => ax.select('.domain').attr('stroke', '#334155'))
      .call(ax => ax.selectAll('.tick line').attr('stroke', '#334155'))
      .call(ax => ax.selectAll('.tick text').attr('fill', '#64748b').attr('font-size', 10))

    // Storm legend
    if (stormIntervals.length) {
      const lg = svg.append('g').attr('transform', `translate(${MARGIN.left + W - 160},${MARGIN.top + 4})`)
      lg.append('rect').attr('width', 10).attr('height', 10).attr('fill', 'rgba(239,68,68,0.4)').attr('rx', 2)
      lg.append('text').attr('x', 14).attr('y', 9).attr('fill', '#f87171').attr('font-size', 9)
        .text('Storm period (Dst < −50 nT)')
    }
  }, [data])

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 bg-slate-900/60">
        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-indigo-400 tracking-wider">V1</span>
        <span className="text-sm font-semibold text-slate-200">Time-Series Overview</span>
        <span className="hidden sm:block text-[10px] text-slate-500 ml-auto">
          Solar wind speed · density · IMF Bz · dynamic pressure
        </span>
      </div>

      {/* Chart area — no horizontal padding so clientWidth = coordinate space width */}
      <div ref={wrapRef} className="relative w-full py-1">
        {!data?.length
          ? <div className="flex items-center justify-center h-48 text-slate-500 text-sm">Waiting for data…</div>
          : <svg ref={svgRef} style={{ display: 'block' }} />
        }
      </div>
    </div>
  )
}
