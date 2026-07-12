import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { SW_TYPES, SW_TYPE_COLOR, SW_TYPE_LABEL } from '../utils/swType'

// Threat Escalation Flow — a 3-stage Sankey (driver type → is Bz southward
// this hour? → is this a storm hour?), hand-built with plain SVG ribbons
// (no d3-sankey dependency needed for a fixed 4→2→2 layout). Built from
// /api/escalation_flow's hour counts over the loaded Date Range — same
// global filter as every other view (a narrow window just means fewer
// hours aggregated; widen Date Range for the full 31-year picture).
//
// Honest finding baked into the caption: within a given driver type, the
// storm-hour rate barely changes between southward and northward hours
// (e.g. CME ejecta: 48% vs 43%, full dataset) — a single hour's Bz sign is
// a weak predictor on its own; sustained southward stretches matter far
// more (visible in Time Series: Bz stays negative for hours before Dst
// drops).

const GAP = 10
const COL_X = [0.06, 0.46, 0.94]
const SOUTH_COLOR = { false: '#4F8CFF', true: '#f87171' }
const SOUTH_LABEL = { false: 'Northward Bz', true: 'Southward Bz' }
const STORM_COLOR = { false: '#43D9C8', true: '#FF5B54' }
const STORM_LABEL = { false: 'Quiet hour', true: 'Storm hour' }

function layoutColumn(nodes, H, scale) {
  const heights = nodes.map(n => n.value * scale)
  const totalStack = d3.sum(heights) + GAP * (nodes.length - 1)
  let y = (H - totalStack) / 2
  return nodes.map((n, i) => {
    const h = heights[i]
    const node = { ...n, y0: y, y1: y + h }
    y += h + GAP
    return node
  })
}

export default function ThreatEscalation({ start, end }) {
  const wrapRef = useRef(null)
  const svgRef = useRef(null)
  const [flow, setFlow] = useState(null)
  const [error, setError] = useState(null)
  const [sizeTick, setSizeTick] = useState(0)
  // Local isolate filter: click a driver node to condition stages 2-3 on
  // that driver alone — "of CME-ejecta hours, how many turn southward, and
  // how many of those are storm hours" — which the all-drivers view can't
  // answer (its stage-2→3 ribbons mix every driver together).
  const [focusDriver, setFocusDriver] = useState(null)

  useEffect(() => {
    let cancelled = false
    setFlow(null)
    fetch(`/api/escalation_flow?start=${start}&end=${end}`)
      .then(r => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then(d => { if (!cancelled) setFlow(d) })
      .catch(e => { if (!cancelled) setError(String(e)) })
    return () => { cancelled = true }
  }, [start, end])

  useEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver(() => setSizeTick(t => t + 1))
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  // A Date Range change can leave the isolated driver with zero hours in
  // the new window (e.g. CME ejecta isolated, then a quiet window loaded) —
  // that renders driver bars with no ribbons at all, which reads as broken.
  // Drop the isolation instead.
  useEffect(() => {
    if (!flow || !focusDriver) return
    const has = flow.some(f => f.sw_type === focusDriver && f.count > 0)
    if (!has) setFocusDriver(null)
  }, [flow, focusDriver])

  const model = useMemo(() => {
    if (!flow) return null
    const total = d3.sum(flow, d => d.count)
    // A window with zero matching hours would otherwise divide the layout
    // scale by 0 and paint NaN geometry — surface it as an empty state.
    if (!flow.length || total === 0) return { empty: true }

    // Driver isolate: stage-1 nodes always show ALL drivers (at their true
    // sizes, so they stay comparable + clickable); stages 2-3 and every
    // ribbon are computed from the focused driver's rows only.
    const rows = focusDriver ? flow.filter(f => f.sw_type === focusDriver) : flow
    const subTotal = d3.sum(rows, d => d.count)

    const col0 = SW_TYPES.map(t => ({
      id: `sw:${t}`, driver: t, label: SW_TYPE_LABEL[t], color: SW_TYPE_COLOR[t],
      dimmed: focusDriver != null && t !== focusDriver,
      focused: focusDriver === t,
      value: d3.sum(flow.filter(f => f.sw_type === t), f => f.count),
    })).filter(n => n.value > 0)

    const col1 = [false, true].map(s => ({
      id: `south:${s}`, label: SOUTH_LABEL[s], color: SOUTH_COLOR[s],
      value: d3.sum(rows.filter(f => f.bz_southward === s), f => f.count),
    })).filter(n => n.value > 0)

    const col2 = [false, true].map(s => ({
      id: `storm:${s}`, label: STORM_LABEL[s], color: STORM_COLOR[s],
      value: d3.sum(rows.filter(f => f.storm_flag === s), f => f.count),
    })).filter(n => n.value > 0)

    const linksAB = []
    for (const t of SW_TYPES) {
      for (const s of [false, true]) {
        const value = d3.sum(rows.filter(f => f.sw_type === t && f.bz_southward === s), f => f.count)
        if (value > 0) linksAB.push({ sourceId: `sw:${t}`, targetId: `south:${s}`, value })
      }
    }
    const linksBC = []
    for (const s of [false, true]) {
      for (const st of [false, true]) {
        const value = d3.sum(rows.filter(f => f.bz_southward === s && f.storm_flag === st), f => f.count)
        if (value > 0) linksBC.push({ sourceId: `south:${s}`, targetId: `storm:${st}`, value })
      }
    }

    // Storm rate by driver, marginal over Bz sign — the honest-caption number.
    const stormRateByType = {}
    for (const t of SW_TYPES) {
      const tRows = flow.filter(f => f.sw_type === t)
      const tot = d3.sum(tRows, f => f.count)
      const storm = d3.sum(tRows.filter(f => f.storm_flag), f => f.count)
      if (tot > 0) stormRateByType[t] = { storm: Math.round((storm / tot) * 100) }
    }

    return { col0, col1, col2, linksAB, linksBC, total, subTotal, stormRateByType }
  }, [flow, focusDriver])

  useEffect(() => {
    if (!model || model.empty || !wrapRef.current || !svgRef.current) return
    const W = wrapRef.current.clientWidth
    const H = wrapRef.current.clientHeight || 500
    const NODE_W = 16

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', W).attr('height', H)

    const nRows = Math.max(model.col0.length, model.col1.length, model.col2.length)
    const usableH = H - GAP * (nRows - 1) - 40
    const scale = usableH / model.total

    const col0 = layoutColumn(model.col0, H - 40, scale).map(n => ({ ...n, y0: n.y0 + 20, y1: n.y1 + 20 }))
    const col1 = layoutColumn(model.col1, H - 40, scale).map(n => ({ ...n, y0: n.y0 + 20, y1: n.y1 + 20 }))
    const col2 = layoutColumn(model.col2, H - 40, scale).map(n => ({ ...n, y0: n.y0 + 20, y1: n.y1 + 20 }))
    const byId = new Map([...col0, ...col1, ...col2].map(n => [n.id, n]))
    const x0 = COL_X[0] * W, x1 = COL_X[1] * W, x2 = COL_X[2] * W

    const tooltip = d3.select(wrapRef.current).selectAll('div.flow-tip').data([null]).join('div')
      .attr('class', 'flow-tip')
      .style('position', 'absolute').style('pointer-events', 'none')
      .style('background', '#12151C').style('border', '1px solid #252B3A').style('border-radius', '6px')
      .style('padding', '6px 8px').style('font-family', "'JetBrains Mono', monospace").style('font-size', '10px')
      .style('color', '#E7EAF0').style('opacity', 0).style('z-index', 10)

    function showTip(event, html) {
      tooltip.style('opacity', 1).html(html)
      const wrapEl = wrapRef.current
      const node = tooltip.node()
      let left = event.offsetX + 12, top = event.offsetY - node.offsetHeight - 8
      if (left + node.offsetWidth > wrapEl.clientWidth) left = event.offsetX - node.offsetWidth - 12
      if (top < 4) top = event.offsetY + 12
      tooltip.style('left', `${left}px`).style('top', `${top}px`)
    }

    function ribbonPath(xa, ya, xb, yb, thickness) {
      const xc = (xa + xb) / 2
      return `M${xa},${ya} C${xc},${ya} ${xc},${yb} ${xb},${yb}
              L${xb},${yb + thickness} C${xc},${yb + thickness} ${xc},${ya + thickness} ${xa},${ya + thickness} Z`
    }

    // % labels/tooltips: stage-1 percentages are of ALL hours in the window;
    // stages 2-3 (and ribbons) are of the isolated driver's hours when a
    // focus is active — conditional probabilities, which is the whole point
    // of isolating.
    const pctOf = (value, base) => `${((value / base) * 100).toFixed(1)}%`

    function drawLinks(links, xa, xb) {
      const sCursor = new Map(), tCursor = new Map()
      for (const l of links) {
        const sNode = byId.get(l.sourceId), tNode = byId.get(l.targetId)
        const thick = l.value * scale
        const sy = sCursor.get(l.sourceId) ?? sNode.y0
        const ty = tCursor.get(l.targetId) ?? tNode.y0
        sCursor.set(l.sourceId, sy + thick)
        tCursor.set(l.targetId, ty + thick)
        const html = `${sNode.label} → ${tNode.label}<br/><b>${l.value.toLocaleString()}</b> hours (${pctOf(l.value, model.subTotal)}${focusDriver ? ` of ${SW_TYPE_LABEL[focusDriver]} hours` : ''})`
        svg.append('path')
          .attr('d', ribbonPath(xa + NODE_W, sy, xb, ty, thick))
          .attr('fill', sNode.color).attr('fill-opacity', 0.28)
          .style('cursor', 'default')
          .on('mouseover', function (event) {
            d3.select(this).attr('fill-opacity', 0.6)
            showTip(event, html)
          })
          .on('mousemove', event => showTip(event, html))
          .on('mouseout', function () { d3.select(this).attr('fill-opacity', 0.28); tooltip.style('opacity', 0) })
      }
    }

    drawLinks(model.linksAB, x0, x1)
    drawLinks(model.linksBC, x1, x2)

    function drawNodes(nodes, x, pctBase) {
      nodes.forEach(n => {
        const isDriver = n.driver != null
        const html = `<b>${n.label}</b><br/>${n.value.toLocaleString()} hours (${pctOf(n.value, pctBase)})`
          + (isDriver ? `<br/><span style="color:#7C8496">${n.focused ? 'click to show all drivers' : 'click to isolate this driver'}</span>` : '')
        svg.append('rect')
          .attr('x', x).attr('y', n.y0).attr('width', NODE_W).attr('height', Math.max(1, n.y1 - n.y0))
          .attr('fill', n.color).attr('rx', 2)
          .attr('fill-opacity', n.dimmed ? 0.3 : 1)
          .attr('stroke', n.focused ? '#E7EAF0' : 'none').attr('stroke-width', 1.5)
          .style('cursor', isDriver ? 'pointer' : 'default')
          .on('mouseover', event => showTip(event, html))
          .on('mousemove', event => showTip(event, html))
          .on('mouseout', () => tooltip.style('opacity', 0))
          .on('click', () => {
            if (isDriver) setFocusDriver(f => (f === n.driver ? null : n.driver))
          })
        const labelLeft = x < W / 2
        svg.append('text')
          .attr('x', labelLeft ? x - 8 : x + NODE_W + 8).attr('y', (n.y0 + n.y1) / 2 - 4)
          .attr('text-anchor', labelLeft ? 'end' : 'start')
          .attr('fill', n.dimmed ? '#4B5265' : '#E7EAF0').attr('font-size', 11).attr('font-family', "'JetBrains Mono', monospace")
          .text(n.label)
        svg.append('text')
          .attr('x', labelLeft ? x - 8 : x + NODE_W + 8).attr('y', (n.y0 + n.y1) / 2 + 10)
          .attr('text-anchor', labelLeft ? 'end' : 'start')
          .attr('fill', n.dimmed ? '#3A4050' : '#7C8496').attr('font-size', 9).attr('font-family', "'JetBrains Mono', monospace")
          .text(pctOf(n.value, pctBase))
      })
    }
    drawNodes(col0, x0, model.total)
    drawNodes(col1, x1, model.subTotal)
    drawNodes(col2, x2, model.subTotal)

  }, [model, sizeTick, focusDriver])

  return (
    <div className="h-full flex flex-col bg-space-panel border border-space-hairline rounded-xl overflow-hidden">
      <div className="flex-none flex items-center gap-3 px-4 py-2 border-b border-space-hairline bg-space-panel-2/60 flex-wrap">
        <span className="text-sm font-semibold text-space-text" title="Every hour classified 3 ways: driver type, is Bz southward this hour, is this a storm hour — over the loaded Date Range. Click a driver node to isolate its flow.">
          Threat Escalation Flow
        </span>

        {focusDriver ? (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border font-mono text-[10px]"
            style={{ borderColor: SW_TYPE_COLOR[focusDriver], color: SW_TYPE_COLOR[focusDriver] }}>
            isolating: {SW_TYPE_LABEL[focusDriver]}
            <button
              onClick={() => setFocusDriver(null)}
              aria-label="Show all drivers"
              title="Show all drivers"
              className="hover:text-space-text leading-none"
            >
              ✕
            </button>
          </span>
        ) : (
          <span className="text-[10px] font-mono text-space-faint">click a driver node to isolate its flow</span>
        )}

        <span className="ml-auto text-[10px] font-mono text-space-faint">driver → Bz direction → storm outcome · follows Date Range only</span>
      </div>

      <div ref={wrapRef} className="relative w-full flex-1 min-h-0 overflow-hidden">
        {!model
          ? <div className="flex items-center justify-center h-full text-space-faint text-sm font-mono">
              {error ? `Could not load escalation data: ${error}` : 'Loading flow…'}
            </div>
          : model.empty
            ? <div className="flex items-center justify-center h-full text-space-faint text-sm font-mono">
                No hours in this date range — adjust Date Range above.
              </div>
            : <svg ref={svgRef} style={{ display: 'block' }} />
        }
      </div>

      {model && !model.empty && (
        <div className="flex-none px-4 py-2.5 border-t border-space-hairline text-[10px] font-mono text-space-faint leading-relaxed">
          Storm rate by driver (marginal over Bz sign): {SW_TYPES.filter(t => model.stormRateByType[t]).map(t =>
            <span key={t}><b style={{ color: SW_TYPE_COLOR[t] }}>{SW_TYPE_LABEL[t]} {model.stormRateByType[t].storm}%</b>{' · '}</span>
          )}
          <br />A single hour's Bz sign barely moves the storm rate within a driver type — sustained southward stretches matter far more than any one snapshot (watch Bz stay negative for hours before Dst drops in Time Series).
        </div>
      )}
    </div>
  )
}
