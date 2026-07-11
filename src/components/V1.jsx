import { useRef, useEffect, useState } from 'react'
import * as d3 from 'd3'

// Small multiples: every parameter stacked on one shared time axis instead of
// a single chart you flip through via a dropdown — storms are caused by a
// *sequence* (speed jumps, then Bz turns negative, then Dst crashes a few
// hours later), and that sequence only reads clearly when every line lines
// up on the same x-axis at once.
const ROWS = [
  { key: 'flow_speed_kms',     label: 'Speed',   unit: 'km/s', color: '#4ade80' },
  { key: 'proton_density_ncc', label: 'Density', unit: 'n/cc', color: '#60a5fa' },
  { key: 'bz_gsm_nT',          label: 'Bz',      unit: 'nT',   color: '#f87171', zeroline: true },
  { key: 'pdyn_computed_nPa',  label: 'Pdyn',    unit: 'nPa',  color: '#fbbf24' },
  { key: 'dst_omni',           label: 'Dst',     unit: 'nT',   color: '#38bdf8', zeroline: true },
  { key: 'proton_temp_K',      label: 'Temp',    unit: 'K',    color: '#f472b6' },
]

const MARGIN = { top: 10, right: 20, bottom: 36, left: 60 }
const ROW_GAP = 14

// Both /api/data and /api/orbital/storms represent the same UTC instants,
// just formatted differently — compare as plain ISO strings, never via
// `new Date()` (documented timezone-string-family gotcha for this project).
const stripZ = s => (s.endsWith('Z') ? s.slice(0, -1) : s)

export default function V1({ data, setDraftStart, setDraftEnd, selectedPoints, selectedStorm }) {
  const svgRef  = useRef(null)
  const wrapRef = useRef(null)

  const [sizeTick, setSizeTick] = useState(0)
  useEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver(() => setSizeTick(t => t + 1))
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  const [emptyAll, setEmptyAll] = useState(false)

  useEffect(() => {
    if (!data?.length || !svgRef.current || !wrapRef.current) return

    const totalW = wrapRef.current.clientWidth
    const totalH = wrapRef.current.clientHeight || 600
    const W = totalW - MARGIN.left - MARGIN.right
    const availH = totalH - MARGIN.top - MARGIN.bottom
    const CH_H = Math.max(40, (availH - (ROWS.length - 1) * ROW_GAP) / ROWS.length)
    const H = ROWS.length * (CH_H + ROW_GAP) - ROW_GAP

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', totalW).attr('height', totalH)

    const parsed = data
      .filter(d => d.datetime)
      .map(d => ({ ...d, t: new Date(d.datetime) }))

    const bisectDate = d3.bisector(d => d.t).center

    const xScale = d3.scaleTime()
      .domain(d3.extent(parsed, d => d.t))
      .range([0, W])

    // Detect contiguous storm intervals once — track raw datetime strings too
    // (not just parsed Date objects) so a run can be matched against
    // `selectedStorm` the same way V3 matches it against `stormCatalog`.
    const stormIntervals = []
    let inStorm = false, stormStart = null, stormStartRaw = null
    parsed.forEach((d, i) => {
      if (d.storm_flag && !inStorm) { inStorm = true; stormStart = d.t; stormStartRaw = d.datetime }
      if (!d.storm_flag && inStorm) {
        stormIntervals.push([stormStart, parsed[i - 1].t, stormStartRaw, parsed[i - 1].datetime])
        inStorm = false
      }
    })
    if (inStorm) stormIntervals.push([stormStart, parsed[parsed.length - 1].t, stormStartRaw, parsed[parsed.length - 1].datetime])

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    // Panel background spanning the whole stack
    g.append('rect').attr('width', W).attr('height', H).attr('fill', '#0E1117').attr('rx', 3)

    // Storm shading — violet, spans the full stack so a storm's alignment
    // across every parameter is visible at a glance, not just in one row.
    // The interval matching the globally selected storm (if any) gets a
    // stronger fill + solid teal outline so picking a storm elsewhere
    // visibly sticks here too, not just in Storm Analysis/Orbital Sim.
    stormIntervals.forEach(([s, e, raw0, raw1]) => {
      const isSelected = selectedStorm && stripZ(selectedStorm.start) <= raw1 && stripZ(selectedStorm.end) >= raw0
      const x = xScale(s), w = Math.max(1, xScale(e) - xScale(s))
      g.append('rect')
        .attr('x', x).attr('y', 0)
        .attr('width', w).attr('height', H)
        .attr('fill', isSelected ? 'rgba(67,217,200,0.22)' : 'rgba(168,85,247,0.14)')
        .attr('stroke', isSelected ? '#43D9C8' : 'none')
        .attr('stroke-width', isSelected ? 1.5 : 0)
    })

    // Selection strip: ISO timestamps lassoed in Phase Space — thin lines
    // spanning the full stack, so a lassoed cluster's timing reads against
    // every parameter at once instead of just one row.
    if (selectedPoints?.length) {
      const selSet = new Set(selectedPoints)
      parsed.forEach(d => {
        if (!selSet.has(d.datetime)) return
        const px = xScale(d.t)
        g.append('line')
          .attr('x1', px).attr('x2', px)
          .attr('y1', 0).attr('y2', H)
          .attr('stroke', '#8b5cf6').attr('stroke-width', 1).attr('stroke-opacity', 0.55)
      })
    }

    let totalNonNull = 0
    const rowRenders = []

    ROWS.forEach((row, ri) => {
      const rowTop = ri * (CH_H + ROW_GAP)
      const rg = g.append('g').attr('transform', `translate(0,${rowTop})`)

      const vals = parsed.map(d => d[row.key]).filter(v => v != null)
      totalNonNull += vals.length
      const [yMin, yMax] = vals.length ? d3.extent(vals) : [0, 1]
      const pad = (yMax - yMin) * 0.08 || 1
      const yScale = d3.scaleLinear().domain([yMin - pad, yMax + pad]).range([CH_H, 0])

      // Zero line (Bz/Dst only)
      if (row.zeroline && yMin < 0 && yMax > 0) {
        const y0 = yScale(0)
        rg.append('line')
          .attr('x1', 0).attr('x2', W).attr('y1', y0).attr('y2', y0)
          .attr('stroke', '#252B3A').attr('stroke-dasharray', '4,3').attr('stroke-width', 1)
      }

      // Tick values that won't crowd this row's own top/bottom edge
      const EDGE_MARGIN = 6
      const rawTicks = yScale.ticks(3)
      const yTicks = rawTicks.filter(v => {
        const py = yScale(v)
        return py > EDGE_MARGIN && py < CH_H - EDGE_MARGIN
      })
      if (!yTicks.length) yTicks.push(...rawTicks)

      // Grid lines
      rg.append('g')
        .call(d3.axisLeft(yScale).tickValues(yTicks).tickSize(-W).tickFormat(''))
        .call(ax => ax.select('.domain').remove())
        .call(ax => ax.selectAll('.tick line').attr('stroke', '#1E2330').attr('stroke-width', 1))

      // Line — gaps stay gaps, so instrument saturation reads honestly
      const line = d3.line()
        .defined(d => d[row.key] != null)
        .x(d => xScale(d.t))
        .y(d => yScale(d[row.key]))
        .curve(d3.curveLinear)

      rg.append('path')
        .datum(parsed)
        .attr('fill', 'none')
        .attr('stroke', row.color)
        .attr('stroke-width', 1.5)
        .attr('d', line)

      // Y axis ticks — dimmed so the data line stays the brightest pixels.
      // `~s` gives compact SI-prefixed labels (e.g. "200k") so Temp's
      // hundred-thousand-Kelvin values don't blow out the left margin.
      rg.append('g')
        .call(d3.axisLeft(yScale).tickValues(yTicks).tickSize(4).tickFormat(d3.format('~s')))
        .call(ax => ax.select('.domain').remove())
        .call(ax => ax.selectAll('.tick line').attr('stroke', '#252B3A'))
        .call(ax => ax.selectAll('.tick text')
          .attr('fill', '#7C8496').attr('font-family', "'JetBrains Mono', monospace").attr('font-size', 9).attr('dx', -2))

      // Row label
      rg.append('text')
        .attr('x', 6).attr('y', 11)
        .attr('fill', row.color).attr('font-size', 10).attr('font-family', "'JetBrains Mono', monospace").attr('font-weight', 600)
        .text(`${row.label} (${row.unit})`)

      // Per-row empty state — only this row's strip says so, the other
      // rows keep rendering normally.
      if (!vals.length) {
        rg.append('text')
          .attr('x', W / 2).attr('y', CH_H / 2)
          .attr('text-anchor', 'middle').attr('fill', '#4B5265').attr('font-size', 10).attr('font-family', "'JetBrains Mono', monospace")
          .text(`No ${row.label} data matches the current filters`)
      }

      const hoverCircle = rg.append('circle')
        .attr('r', 4)
        .attr('fill', row.color)
        .attr('stroke', '#E7EAF0')
        .attr('stroke-width', 1.2)
        .style('display', 'none')

      rowRenders.push({ key: row.key, yScale, hoverCircle })
    })

    setEmptyAll(totalNonNull === 0)

    // Shared X axis, drawn once below the whole stack
    svg.append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top + H})`)
      .call(d3.axisBottom(xScale).ticks(Math.max(3, Math.round(W / 110))))
      .call(ax => ax.select('.domain').attr('stroke', '#1E2330'))
      .call(ax => ax.selectAll('.tick line').attr('stroke', '#1E2330'))
      .call(ax => ax.selectAll('.tick text').attr('fill', '#7C8496').attr('font-family', "'JetBrains Mono', monospace").attr('font-size', 10))

    //--------------------------------------------------
    // Shared crosshair + tooltip (every parameter at once) + drag-to-set-range
    //--------------------------------------------------

    let selecting = false
    let startX = 0

    const selectionRect = svg.append('rect')
      .attr('display', 'none')
      .attr('fill', 'rgba(139,92,246,0.20)')
      .attr('stroke', '#8b5cf6')
      .attr('stroke-width', 2)

    const crosshair = g.append('line')
      .attr('y1', 0).attr('y2', H)
      .attr('stroke', '#4B5265').attr('stroke-width', 1)
      .style('display', 'none')

    // Remove any tooltip left over from a prior run of this effect (resize,
    // new selection) — without this, a fresh div piles up on the DOM every
    // re-render instead of replacing the old one.
    d3.select(wrapRef.current).selectAll('div.v1-tooltip').remove()
    const tooltip = d3.select(wrapRef.current)
      .append('div')
      .attr('class', 'v1-tooltip')
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('background', '#12151C')
      .style('border', '1px solid #252B3A')
      .style('border-radius', '6px')
      .style('padding', '8px')
      .style('font-family', "'JetBrains Mono', monospace")
      .style('font-size', '11px')
      .style('color', '#E7EAF0')
      .style('opacity', 0)

    svg.append('rect')
      .attr('x', MARGIN.left)
      .attr('y', MARGIN.top)
      .attr('width', W)
      .attr('height', H)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')

      .on('mousedown', function (event) {
        selecting = true
        startX = d3.pointer(event, this)[0]
        selectionRect
          .attr('display', null)
          .attr('x', startX).attr('y', MARGIN.top)
          .attr('width', 0).attr('height', H)
      })

      .on('mousemove', function (event) {
        const [mx] = d3.pointer(event, this)

        if (selecting) {
          selectionRect.attr('x', Math.min(startX, mx)).attr('width', Math.abs(mx - startX))
          return
        }

        const date = xScale.invert(mx)
        const d = parsed[bisectDate(parsed, date)]
        if (!d) return

        crosshair.style('display', null).attr('x1', xScale(d.t)).attr('x2', xScale(d.t))
        rowRenders.forEach(({ key, yScale, hoverCircle }) => {
          const v = d[key]
          if (v == null) hoverCircle.style('display', 'none')
          else hoverCircle.style('display', null).attr('cx', xScale(d.t)).attr('cy', yScale(v))
        })

        tooltip
          .style('opacity', 1)
          .html(`
            <div style="font-weight:600;margin-bottom:6px;">
              ${d.t.toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
            </div>
            <hr style="border-color:#252B3A;margin:4px 0"/>
            Speed : ${d.flow_speed_kms?.toFixed(1) ?? '--'} km/s<br/>
            Density : ${d.proton_density_ncc?.toFixed(2) ?? '--'} n/cc<br/>
            Bz : ${d.bz_gsm_nT?.toFixed(2) ?? '--'} nT<br/>
            Pdyn : ${d.pdyn_computed_nPa?.toFixed(2) ?? '--'} nPa<br/>
            Dst : ${d.dst_omni?.toFixed(0) ?? '--'} nT<br/>
            Temp : ${d.proton_temp_K != null ? Math.round(d.proton_temp_K).toLocaleString() : '--'} K<br/>
            Kp : ${d.kp ?? '--'}<br/>
            <b>Storm</b> : ${d.storm_flag ? '🔴 Yes' : '🟢 No'}
          `)

        // Clamp so the tooltip never gets cut off by the panel's own overflow-hidden
        const wrapEl = wrapRef.current
        const node = tooltip.node()
        const tw = node.offsetWidth, th = node.offsetHeight
        let left = event.offsetX + 18
        let top = event.offsetY - th - 16
        if (left + tw > wrapEl.clientWidth) left = event.offsetX - tw - 18
        if (left < 4) left = 4
        if (top < 4) top = event.offsetY + 16
        if (top + th > wrapEl.clientHeight) top = wrapEl.clientHeight - th - 4
        tooltip.style('left', `${left}px`).style('top', `${top}px`)
      })

      .on('mouseout', () => {
        crosshair.style('display', 'none')
        rowRenders.forEach(({ hoverCircle }) => hoverCircle.style('display', 'none'))
        tooltip.style('opacity', 0)
      })

    d3.select(window).on('mouseup.v1', () => {
      if (!selecting) return
      selecting = false

      const rx = +selectionRect.attr('x')
      const rw = +selectionRect.attr('width')

      if (rw > 5) {
        const startDate = xScale.invert(rx - MARGIN.left)
        const endDate = xScale.invert(rx + rw - MARGIN.left)
        setDraftStart(d3.timeFormat('%Y-%m-%d')(startDate))
        setDraftEnd(d3.timeFormat('%Y-%m-%d')(endDate))
      }

      selectionRect.attr('display', 'none')
    })

    return () => {
      d3.select(window).on('mouseup.v1', null)
    }

  }, [data, selectedPoints, selectedStorm, sizeTick, setDraftStart, setDraftEnd])

  return (
    <div className="h-full flex flex-col bg-space-panel border border-space-hairline rounded-xl overflow-hidden">
      {/* Panel header */}
      <div
        className="flex-none flex items-center gap-2 px-4 py-2 border-b border-space-hairline bg-space-panel-2/60"
        title="Drag to set Start/End · violet ticks = points lassoed in Phase Space"
      >
        <span className="text-sm font-semibold text-space-text">Time Series</span>
        <span className="ml-auto text-[10px] font-mono text-space-faint">Speed · Density · Bz · Pdyn · Dst · Temp</span>
      </div>

      {/* Chart area — no horizontal padding so clientWidth = coordinate space width */}
      <div ref={wrapRef} className="relative w-full flex-1 min-h-0 overflow-hidden">
        {!data?.length
          ? <div className="flex items-center justify-center h-full text-space-faint text-sm font-mono">Waiting for data…</div>
          : <>
              <svg ref={svgRef} style={{ display: 'block' }} />
              {emptyAll && (
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
