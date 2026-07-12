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
// (e.g. CME ejecta: 48% vs 43%) — a single hour's Bz sign is a weak
// predictor on its own; sustained southward stretches matter far more
// (that's what Storm Analysis's lag correlation actually measures).

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

  const model = useMemo(() => {
    if (!flow) return null
    const total = d3.sum(flow, d => d.count)

    const col0 = SW_TYPES.map(t => ({
      id: `sw:${t}`, label: SW_TYPE_LABEL[t], color: SW_TYPE_COLOR[t],
      value: d3.sum(flow.filter(f => f.sw_type === t), f => f.count),
    })).filter(n => n.value > 0)

    const col1 = [false, true].map(s => ({
      id: `south:${s}`, label: SOUTH_LABEL[s], color: SOUTH_COLOR[s],
      value: d3.sum(flow.filter(f => f.bz_southward === s), f => f.count),
    }))

    const col2 = [false, true].map(s => ({
      id: `storm:${s}`, label: STORM_LABEL[s], color: STORM_COLOR[s],
      value: d3.sum(flow.filter(f => f.storm_flag === s), f => f.count),
    }))

    const linksAB = []
    for (const t of SW_TYPES) {
      for (const s of [false, true]) {
        const value = d3.sum(flow.filter(f => f.sw_type === t && f.bz_southward === s), f => f.count)
        if (value > 0) linksAB.push({ sourceId: `sw:${t}`, targetId: `south:${s}`, value })
      }
    }
    const linksBC = []
    for (const s of [false, true]) {
      for (const st of [false, true]) {
        const value = d3.sum(flow.filter(f => f.bz_southward === s && f.storm_flag === st), f => f.count)
        if (value > 0) linksBC.push({ sourceId: `south:${s}`, targetId: `storm:${st}`, value })
      }
    }

    // Storm rate by driver, marginal over Bz sign — the honest-caption number.
    const stormRateByType = {}
    for (const t of SW_TYPES) {
      const rows = flow.filter(f => f.sw_type === t)
      const tot = d3.sum(rows, f => f.count)
      const storm = d3.sum(rows.filter(f => f.storm_flag), f => f.count)
      if (tot > 0) stormRateByType[t] = { storm: Math.round((storm / tot) * 100) }
    }

    return { col0, col1, col2, linksAB, linksBC, total, stormRateByType }
  }, [flow])

  useEffect(() => {
    if (!model || !wrapRef.current) return
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

    function drawLinks(links, xa, xb) {
      const sCursor = new Map(), tCursor = new Map()
      for (const l of links) {
        const sNode = byId.get(l.sourceId), tNode = byId.get(l.targetId)
        const thick = l.value * scale
        const sy = sCursor.get(l.sourceId) ?? sNode.y0
        const ty = tCursor.get(l.targetId) ?? tNode.y0
        sCursor.set(l.sourceId, sy + thick)
        tCursor.set(l.targetId, ty + thick)
        const html = `${sNode.label} → ${tNode.label}<br/><b>${l.value.toLocaleString()}</b> hours (${((l.value / model.total) * 100).toFixed(1)}%)`
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

    function drawNodes(nodes, x) {
      nodes.forEach(n => {
        const html = `<b>${n.label}</b><br/>${n.value.toLocaleString()} hours (${((n.value / model.total) * 100).toFixed(1)}%)`
        svg.append('rect')
          .attr('x', x).attr('y', n.y0).attr('width', NODE_W).attr('height', Math.max(1, n.y1 - n.y0))
          .attr('fill', n.color).attr('rx', 2)
          .on('mouseover', event => showTip(event, html))
          .on('mousemove', event => showTip(event, html))
          .on('mouseout', () => tooltip.style('opacity', 0))
        const labelLeft = x < W / 2
        svg.append('text')
          .attr('x', labelLeft ? x - 8 : x + NODE_W + 8).attr('y', (n.y0 + n.y1) / 2 - 4)
          .attr('text-anchor', labelLeft ? 'end' : 'start')
          .attr('fill', '#E7EAF0').attr('font-size', 11).attr('font-family', "'JetBrains Mono', monospace")
          .text(n.label)
        svg.append('text')
          .attr('x', labelLeft ? x - 8 : x + NODE_W + 8).attr('y', (n.y0 + n.y1) / 2 + 10)
          .attr('text-anchor', labelLeft ? 'end' : 'start')
          .attr('fill', '#7C8496').attr('font-size', 9).attr('font-family', "'JetBrains Mono', monospace")
          .text(`${((n.value / model.total) * 100).toFixed(1)}%`)
      })
    }
    drawNodes(col0, x0)
    drawNodes(col1, x1)
    drawNodes(col2, x2)

  }, [model, sizeTick])

  return (
    <div className="h-full flex flex-col bg-space-panel border border-space-hairline rounded-xl overflow-hidden">
      <div className="flex-none flex items-center gap-3 px-4 py-2 border-b border-space-hairline bg-space-panel-2/60 flex-wrap">
        <span className="text-sm font-semibold text-space-text" title="Every hour classified 3 ways: driver type, is Bz southward this hour, is this a storm hour — over the loaded Date Range">
          Threat Escalation Flow
        </span>

        <span className="ml-auto text-[10px] font-mono text-space-faint">driver → Bz direction → storm outcome</span>
      </div>

      <div ref={wrapRef} className="relative w-full flex-1 min-h-0 overflow-hidden">
        {!model
          ? <div className="flex items-center justify-center h-full text-space-faint text-sm font-mono">
              {error ? `Could not load escalation data: ${error}` : 'Loading flow…'}
            </div>
          : <svg ref={svgRef} style={{ display: 'block' }} />
        }
      </div>

      {model && (
        <div className="flex-none px-4 py-2.5 border-t border-space-hairline text-[10px] font-mono text-space-faint leading-relaxed">
          Storm rate by driver (marginal over Bz sign): {SW_TYPES.filter(t => model.stormRateByType[t]).map(t =>
            <span key={t}><b style={{ color: SW_TYPE_COLOR[t] }}>{SW_TYPE_LABEL[t]} {model.stormRateByType[t].storm}%</b>{' · '}</span>
          )}
          <br />A single hour's Bz sign barely moves the storm rate within a driver type — sustained southward stretches matter far more than any one snapshot (see Storm Analysis's lag correlation).
        </div>
      )}
    </div>
  )
}
