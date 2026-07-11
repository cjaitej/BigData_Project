import { useRef, useEffect, useState } from 'react'
import * as d3 from 'd3'

const PARAMS = [
  { key: 'flow_speed_kms',     label: 'Speed',   unit: 'km/s', color: '#4ade80' },
  { key: 'proton_density_ncc', label: 'Density', unit: 'n/cc', color: '#60a5fa' },
  { key: 'bz_gsm_nT',          label: 'Bz',      unit: 'nT',   color: '#f87171', zeroline: true },
  { key: 'pdyn_computed_nPa',  label: 'Pdyn',    unit: 'nPa',  color: '#fbbf24' },
]

const MARGIN = { top: 10, right: 20, bottom: 36, left: 55 }

export default function V1({ data, setDraftStart, setDraftEnd, selectedPoints }) {
  const svgRef  = useRef(null)
  const wrapRef = useRef(null)

  const [activeParam, setActiveParam] = useState('flow_speed_kms')

  const [sizeTick, setSizeTick] = useState(0)
  useEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver(() => setSizeTick(t => t + 1))
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!data?.length || !svgRef.current || !wrapRef.current) return

    const totalW = wrapRef.current.clientWidth
    const totalH = wrapRef.current.clientHeight || 300
    const W = totalW - MARGIN.left - MARGIN.right
    const H = totalH - MARGIN.top - MARGIN.bottom
    const param = PARAMS.find(p => p.key === activeParam)

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

    const vals = parsed.map(d => d[param.key]).filter(v => v != null)
    const [yMin, yMax] = vals.length ? d3.extent(vals) : [0, 1]
    const pad = (yMax - yMin) * 0.08 || 1
    const yScale = d3.scaleLinear().domain([yMin - pad, yMax + pad]).range([H, 0])

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

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    // Panel background
    g.append('rect').attr('width', W).attr('height', H).attr('fill', '#0E1117').attr('rx', 3)

    // Storm shading — violet, so it never blends into the red Bz line
    stormIntervals.forEach(([s, e]) => {
      g.append('rect')
        .attr('x', xScale(s)).attr('y', 0)
        .attr('width', Math.max(1, xScale(e) - xScale(s)))
        .attr('height', H)
        .attr('fill', 'rgba(168,85,247,0.14)')
    })

    // Zero line (Bz only)
    if (param.zeroline && yMin < 0 && yMax > 0) {
      const y0 = yScale(0)
      g.append('line')
        .attr('x1', 0).attr('x2', W).attr('y1', y0).attr('y2', y0)
        .attr('stroke', '#252B3A').attr('stroke-dasharray', '4,3').attr('stroke-width', 1)
    }

    // Tick values that won't crowd the chart's own top/bottom edge
    const tickCount = H < 90 ? 3 : 5
    const EDGE_MARGIN = 8
    const rawTicks = yScale.ticks(tickCount)
    const yTickValues = rawTicks.filter(v => {
      const py = yScale(v)
      return py > EDGE_MARGIN && py < H - EDGE_MARGIN
    })
    if (!yTickValues.length) yTickValues.push(...rawTicks)

    // Grid lines
    g.append('g')
      .call(d3.axisLeft(yScale).tickValues(yTickValues).tickSize(-W).tickFormat(''))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('.tick line').attr('stroke', '#1E2330').attr('stroke-width', 1))

    // Line — gaps stay gaps, so instrument saturation reads honestly
    const line = d3.line()
      .defined(d => d[param.key] != null)
      .x(d => xScale(d.t))
      .y(d => yScale(d[param.key]))
      .curve(d3.curveLinear)

    g.append('path')
      .datum(parsed)
      .attr('fill', 'none')
      .attr('stroke', param.color)
      .attr('stroke-width', 1.5)
      .attr('d', line)

    // Selection strip: ISO timestamps lassoed in Phase Space
    if (selectedPoints?.length) {
      const selSet = new Set(selectedPoints)
      parsed.forEach(d => {
        if (!selSet.has(d.datetime)) return
        const px = xScale(d.t)
        g.append('line')
          .attr('x1', px).attr('x2', px)
          .attr('y1', H - 6).attr('y2', H)
          .attr('stroke', '#8b5cf6').attr('stroke-width', 1.5)
      })
    }

    const hoverCircle = g.append('circle')
      .attr('r', 5)
      .attr('fill', param.color)
      .attr('stroke', '#E7EAF0')
      .attr('stroke-width', 1.5)
      .style('display', 'none')

    // Y axis ticks — dimmed so the data line stays the brightest pixels
    g.append('g')
      .call(d3.axisLeft(yScale).tickValues(yTickValues).tickSize(4))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('.tick line').attr('stroke', '#252B3A'))
      .call(ax => ax.selectAll('.tick text')
        .attr('fill', '#7C8496').attr('font-family', "'JetBrains Mono', monospace").attr('font-size', 9).attr('dx', -2))

    // Shared X axis
    svg.append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top + H})`)
      .call(d3.axisBottom(xScale).ticks(Math.max(3, Math.round(W / 110))))
      .call(ax => ax.select('.domain').attr('stroke', '#1E2330'))
      .call(ax => ax.selectAll('.tick line').attr('stroke', '#1E2330'))
      .call(ax => ax.selectAll('.tick text').attr('fill', '#7C8496').attr('font-family', "'JetBrains Mono', monospace").attr('font-size', 10))

    //--------------------------------------------------
    // Drag-to-set-range + local hover tooltip
    //--------------------------------------------------

    let selecting = false
    let startX = 0

    const selectionRect = svg.append('rect')
      .attr('display', 'none')
      .attr('fill', 'rgba(139,92,246,0.20)')
      .attr('stroke', '#8b5cf6')
      .attr('stroke-width', 2)

    const tooltip = d3.select(wrapRef.current)
      .append('div')
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

        const value = d[param.key]
        if (value == null) {
          hoverCircle.style('display', 'none')
        } else {
          hoverCircle.style('display', null).attr('cx', xScale(d.t)).attr('cy', yScale(value))
        }

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
            Kp : ${d.kp ?? '--'} · Dst : ${d.dst_omni ?? '--'} nT<br/>
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
        hoverCircle.style('display', 'none')
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

  }, [data, activeParam, selectedPoints, sizeTick, setDraftStart, setDraftEnd])

  return (
    <div className="h-full flex flex-col bg-space-panel border border-space-hairline rounded-xl overflow-hidden">
      {/* Panel header */}
      <div
        className="flex-none flex items-center gap-2 px-4 py-2 border-b border-space-hairline bg-space-panel-2/60"
        title="Drag to set Start/End · violet ticks = points lassoed in Phase Space"
      >
        <span className="text-sm font-semibold text-space-text">Time Series</span>
        <select
          value={activeParam}
          onChange={e => setActiveParam(e.target.value)}
          className="ml-auto bg-space-panel-2 border border-space-hairline rounded px-2 py-0.5 text-[10px] font-mono text-space-dim"
        >
          {PARAMS.map(p => (
            <option key={p.key} value={p.key}>{p.label} ({p.unit})</option>
          ))}
        </select>
      </div>

      {/* Chart area — no horizontal padding so clientWidth = coordinate space width */}
      <div ref={wrapRef} className="relative w-full flex-1 min-h-0 overflow-hidden">
        {!data?.length
          ? <div className="flex items-center justify-center h-full text-space-faint text-sm font-mono">Waiting for data…</div>
          : <svg ref={svgRef} style={{ display: 'block' }} />
        }
      </div>
    </div>
  )
}
