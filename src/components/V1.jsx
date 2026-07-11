import { useRef, useEffect, useState } from 'react'
import * as d3 from 'd3'

const PANELS = [
  { key: 'flow_speed_kms',     label: 'Speed',   unit: 'km/s', color: '#4ade80' },
  { key: 'proton_density_ncc', label: 'Density', unit: 'n/cc', color: '#60a5fa' },
  { key: 'bz_gsm_nT',          label: 'Bz',      unit: 'nT',   color: '#f87171', zeroline: true },
  { key: 'pdyn_computed_nPa',  label: 'Pdyn',    unit: 'nPa',  color: '#fbbf24' },
]

const MARGIN  = { top: 8, right: 20, bottom: 36, left: 46 }
const PANEL_GAP = 10

export default function V1({ data, setDraftStart, setDraftEnd, hoverTime, setHoverTime, selection, setSelection }) {
  const svgRef  = useRef(null)
  const wrapRef = useRef(null)
  const chartRef = useRef(null)   // scales + hover elements for the linked-view effects

  // Redraw when the grid cell resizes — chart height follows the container
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
    const availH = wrapRef.current.clientHeight || 419
    const W      = totalW - MARGIN.left - MARGIN.right
    const n      = PANELS.length
    const PANEL_H = Math.max(30, (availH - MARGIN.top - MARGIN.bottom - (n - 1) * PANEL_GAP) / n)
    const totalH = MARGIN.top + n * PANEL_H + (n - 1) * PANEL_GAP + MARGIN.bottom

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', totalW).attr('height', totalH)

    const parsed = data
      .filter(d => d.datetime)
      .map(d => ({ ...d, t: new Date(d.datetime) }))

    const bisectDate = d3.bisector(d => d.t).center

    const panelInfo = []

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

      // Pick tick values that won't crowd the panel's own top/bottom edge —
      // a label right at y=0 or y=PANEL_H would bleed into the next panel
      // across the narrow gap between them.
      const tickCount = PANEL_H < 45 ? 2 : 3
      const EDGE_MARGIN = 7
      const rawTicks = yScale.ticks(tickCount)
      const yTickValues = rawTicks.filter(v => {
        const py = yScale(v)
        return py > EDGE_MARGIN && py < PANEL_H - EDGE_MARGIN
      })
      if (!yTickValues.length) yTickValues.push(...rawTicks)

      // Panel background
      g.append('rect')
        .attr('width', W).attr('height', PANEL_H)
        .attr('fill', '#0E1117').attr('rx', 3)

      // Storm shading — violet, so it never blends into the red Bz line
      stormIntervals.forEach(([s, e]) => {
        g.append('rect')
          .attr('x', xScale(s)).attr('y', 0)
          .attr('width', Math.max(1, xScale(e) - xScale(s)))
          .attr('height', PANEL_H)
          .attr('fill', 'rgba(168,85,247,0.14)')
      })

      // Zero line (Bz only)
      if (panel.zeroline && yMin < 0 && yMax > 0) {
        const y0 = yScale(0)
        g.append('line')
          .attr('x1', 0).attr('x2', W).attr('y1', y0).attr('y2', y0)
          .attr('stroke', '#252B3A').attr('stroke-dasharray', '4,3').attr('stroke-width', 1)
      }

      // Grid lines
      g.append('g')
        .call(d3.axisLeft(yScale).tickValues(yTickValues).tickSize(-W).tickFormat(''))
        .call(ax => ax.select('.domain').remove())
        .call(ax => ax.selectAll('.tick line').attr('stroke', '#1E2330').attr('stroke-width', 1))

      // Line
      const line = d3.line()
        .defined(d => d[panel.key] != null)
        .x(d => xScale(d.t))
        .y(d => yScale(d[panel.key]))
        .curve(d3.curveLinear)

      g.append('path')
        .datum(parsed)
        .attr('fill', 'none')
        .attr('stroke', panel.color)
        .attr('stroke-width', 1.2)
        .attr('d', line)

      const hoverCircle = g.append('circle')
        .attr('r', 5)
        .attr('fill', panel.color)
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5)
        .style('display', 'none')

      panelInfo.push({
        panel,
        yScale,
        hoverCircle
      })

      // Y axis ticks — dimmed so the data lines stay the brightest pixels
      g.append('g')
        .call(d3.axisLeft(yScale).tickValues(yTickValues).tickSize(4))
        .call(ax => ax.select('.domain').remove())
        .call(ax => ax.selectAll('.tick line').attr('stroke', '#252B3A'))
        .call(ax => ax.selectAll('.tick text')
          .attr('fill', '#7C8496').attr('font-family', "'JetBrains Mono', monospace").attr('font-size', 9).attr('dx', -2))
    })

    // Shared X axis — dimmed so the data lines stay the brightest pixels
    const xAxisY = MARGIN.top + n * PANEL_H + (n - 1) * PANEL_GAP
    svg.append('g')
      .attr('transform', `translate(${MARGIN.left},${xAxisY})`)
      .call(d3.axisBottom(xScale).ticks(Math.max(3, Math.round(W / 110))))
      .call(ax => ax.select('.domain').attr('stroke', '#252B3A'))
      .call(ax => ax.selectAll('.tick line').attr('stroke', '#252B3A'))
      .call(ax => ax.selectAll('.tick text').attr('fill', '#7C8496').attr('font-family', "'JetBrains Mono', monospace").attr('font-size', 10))
    //--------------------------------------------------
    // Hover Layer
    //--------------------------------------------------

    //--------------------------------------------------
    // Selection
    //--------------------------------------------------

    let selecting = false
    let startX = 0

    const selectionRect = svg.append("rect")
        .attr("display", "none")
        .attr("fill", "rgba(139,92,246,0.20)")
        .attr("stroke", "#8b5cf6")
        .attr("stroke-width", 2)

    const hoverLine = svg.append('line')
      .attr('y1', MARGIN.top)
      .attr('y2', xAxisY)
      .attr('stroke', '#7C8496')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4,3')
      .style('display', 'none')

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

    // Persistent band showing the shared selection (drawn by the selection effect)
    const persistBand = svg.append("rect")
        .attr("y", MARGIN.top)
        .attr("height", xAxisY - MARGIN.top)
        .attr("fill", "rgba(139,92,246,0.12)")
        .attr("stroke", "#8b5cf6")
        .attr("stroke-dasharray", "3,3")
        .style("display", "none")

      svg.append("rect")
      .attr("x", MARGIN.left)
      .attr("y", MARGIN.top)
      .attr("width", W)
      .attr("height", xAxisY - MARGIN.top)
      .attr("fill", "transparent")
      .style("cursor", "crosshair")
      
      .on("mousedown", function(event){

      selecting = true

      startX = d3.pointer(event, this)[0]

      selectionRect

          .attr("display", null)

          .attr("x", startX)

          .attr("y", MARGIN.top)

          .attr("width", 0)

          .attr("height", xAxisY - MARGIN.top)

  })

      .on("mousemove", function(event){

        const [mx] = d3.pointer(event, this)

        if(selecting){

            selectionRect

                .attr("x", Math.min(startX, mx))

                .attr("width", Math.abs(mx - startX))

            return
        }


        const x = mx - MARGIN.left

        const date = xScale.invert(x)

        const idx = bisectDate(parsed, date)

        const d = parsed[idx]

        if (!d) return

        // cursor line + circles are drawn by the shared hoverTime effect below
        setHoverTime(d.t)

        tooltip
        .style("opacity", 1)
        .html(`
          <div style="font-weight:600;margin-bottom:6px;">
            ${d.t.toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
          </div>

          <hr style="border-color:#252B3A;margin:4px 0"/>

          <b>Solar Wind</b><br/>
          Speed : ${d.flow_speed_kms?.toFixed(1) ?? "--"} km/s<br/>
          Density : ${d.proton_density_ncc?.toFixed(2) ?? "--"} n/cc<br/>
          Pressure : ${d.pdyn_computed_nPa?.toFixed(2) ?? "--"} nPa<br/>

          <br/>

          <b>Magnetic Field</b><br/>
          Bz : ${d.bz_gsm_nT?.toFixed(2) ?? "--"} nT<br/>

          <br/>

          <b>Geomagnetic</b><br/>
          Kp : ${d.kp ?? "--"}<br/>
          Dst : ${d.dst_omni ?? "--"} nT<br/>

          <br/>

          <b>Storm</b> :
          ${d.storm_flag ? "🔴 Yes" : "🟢 No"}

        `)

        // Clamp so the tooltip never gets cut off by the panel's own
        // overflow-hidden — flip to the other side of the cursor instead.
        const wrapEl = wrapRef.current
        const node = tooltip.node()
        const tw = node.offsetWidth, th = node.offsetHeight
        let left = event.offsetX + 18
        let top = event.offsetY - th - 16
        if (left + tw > wrapEl.clientWidth) left = event.offsetX - tw - 18
        if (left < 4) left = 4
        if (top < 4) top = event.offsetY + 16
        if (top + th > wrapEl.clientHeight) top = wrapEl.clientHeight - th - 4
        tooltip.style("left", `${left}px`).style("top", `${top}px`)

      })

      .on("mouseout", () => {

        setHoverTime(null)

        tooltip.style("opacity", 0)

    })

      .on("dblclick", () => {

        setSelection(null)

    })

    d3.select(window)

    .on("mouseup.v1", ()=>{

        if(!selecting) return

        selecting = false

        const x = +selectionRect.attr("x")
        const w = +selectionRect.attr("width")

        if(w > 5){

            const startDate = xScale.invert(x - MARGIN.left)
            const endDate = xScale.invert(x + w - MARGIN.left)

            setDraftStart(
                d3.timeFormat("%Y-%m-%d")(startDate)
            )

            setDraftEnd(
                d3.timeFormat("%Y-%m-%d")(endDate)
            )

            setSelection([startDate, endDate])

        }

        selectionRect.attr("display","none")

    })
    //--------------------------------------------------
    // Brush
    //--------------------------------------------------

    // const brush = d3.brushX()

    //   .extent([
    //       [MARGIN.left, MARGIN.top],
    //       [MARGIN.left + W, xAxisY]
    //   ])

    //   .on("end", (event) => {

    //       if (!event.selection) return

    //       const [x0, x1] = event.selection

    //       const startDate = xScale.invert(x0 - MARGIN.left)
    //       const endDate   = xScale.invert(x1 - MARGIN.left)

    //       setDraftStart(
    //           d3.timeFormat("%Y-%m-%d")(startDate)
    //       )

    //       setDraftEnd(
    //           d3.timeFormat("%Y-%m-%d")(endDate)
    //       )

    //       brushGroup.call(brush.move, null)

    //   })

    // const brushGroup = svg.append("g")

    //     .attr("class","brush")

    //     .call(brush)

    chartRef.current = { xScale, parsed, bisectDate, panelInfo, hoverLine, persistBand }

    return ()=>{

    d3.select(window)

        .on("mouseup.v1", null)

}

  }, [data, sizeTick, setDraftStart, setDraftEnd, setHoverTime, setSelection])

  //--------------------------------------------------
  // Linked hover — cursor driven by shared hoverTime
  // (set here, in V2 or in V3)
  //--------------------------------------------------

  useEffect(() => {

    const c = chartRef.current
    if (!c) return

    const { xScale, parsed, bisectDate, panelInfo, hoverLine } = c

    const hide = () => {
      hoverLine.style("display", "none")
      panelInfo.forEach(p => p.hoverCircle.style("display", "none"))
    }

    if (!hoverTime || !parsed.length) return hide()

    const [d0, d1] = xScale.domain()
    if (hoverTime < d0 || hoverTime > d1) return hide()

    const d = parsed[bisectDate(parsed, hoverTime)]
    if (!d) return hide()

    const cx = MARGIN.left + xScale(d.t)

    hoverLine
      .style("display", null)
      .attr("x1", cx)
      .attr("x2", cx)

    panelInfo.forEach(p => {

      const value = d[p.panel.key]

      if (value == null) {
        p.hoverCircle.style("display", "none")
        return
      }

      p.hoverCircle
        .style("display", null)
        .attr("cx", xScale(d.t))
        .attr("cy", p.yScale(value))

    })

  }, [hoverTime, data])

  //--------------------------------------------------
  // Linked selection — persistent band for the
  // shared brushed range
  //--------------------------------------------------

  useEffect(() => {

    const c = chartRef.current
    if (!c) return

    const { xScale, persistBand } = c

    // note: never return the d3 selection from the effect — React would
    // treat it as a cleanup function and crash
    if (!selection) {
      persistBand.style("display", "none")
      return
    }

    const [d0, d1] = xScale.domain()
    const s = Math.max(selection[0], d0)
    const e = Math.min(selection[1], d1)

    if (e <= s) {
      persistBand.style("display", "none")
      return
    }

    persistBand
      .style("display", null)
      .attr("x", MARGIN.left + xScale(s))
      .attr("width", xScale(e) - xScale(s))

  }, [selection, data])

  return (
    <div className="h-full flex flex-col bg-space-panel border border-space-hairline rounded-xl overflow-hidden">
      {/* Panel header with unified series legend */}
      <div
        className="flex-none flex items-center flex-wrap gap-x-2 gap-y-0.5 px-4 py-2 border-b border-space-hairline bg-space-panel-2/60"
        title="Drag to select a range · double-click to clear · hover syncs all panels"
      >
        <span className="text-sm font-semibold text-space-text">Solar Wind Parameters</span>
        <div className="flex items-center flex-wrap gap-x-2.5 gap-y-0.5 ml-auto font-mono">
          {PANELS.map(p => (
            <span key={p.key} title={`${p.label} (${p.unit})`} className="flex items-center gap-1 text-[10px] text-space-dim whitespace-nowrap">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color }} />
              {p.label}
            </span>
          ))}
          <span className="flex items-center gap-1 text-[10px] text-space-dim whitespace-nowrap">
            <span className="inline-block w-2 h-2 rounded-sm" style={{ background: 'rgba(168,85,247,0.55)' }} />
            Storm
          </span>
        </div>
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
