import { useRef, useEffect, useState } from 'react'
import * as d3 from 'd3'

const MARGIN = { top: 16, right: 16, bottom: 40, left: 60 }

// Diverging (signed) vs sequential (magnitude) color channels — Bz keeps the
// existing symmetric RdBu treatment, |B| and Kp are single-hue viridis.
const CHANNELS = [
  { key: 'imf_mag_scalar_nT', short: '|B|', label: '|B| (nT)', kind: 'seq' },
  { key: 'bz_gsm_nT',         short: 'Bz',  label: 'Bz (nT)',  kind: 'div' },
  { key: 'kp',                short: 'Kp',  label: 'Kp',       kind: 'seq' },
]

export default function V2({ data, selectedPoints, onSelectPoints }) {
  const wrapRef = useRef(null)
  const svgRef = useRef(null)

  const [channel, setChannel] = useState('bz_gsm_nT')

  const [sizeTick, setSizeTick] = useState(0)
  useEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver(() => setSizeTick(t => t + 1))
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!data?.length || !wrapRef.current) return

    const totalWidth  = wrapRef.current.clientWidth
    const totalHeight = wrapRef.current.clientHeight || 450
    const width  = totalWidth - MARGIN.left - MARGIN.right
    const height = totalHeight - MARGIN.top - MARGIN.bottom

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    d3.select(wrapRef.current).selectAll('div').remove()
    svg.attr('width', totalWidth).attr('height', totalHeight)

    const defs = svg.append('defs')
    defs.append('clipPath').attr('id', 'scatterClip')
      .append('rect').attr('width', width).attr('height', height)

    const plot = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)
    const gridGroup   = plot.append('g')
    const axisGroup   = plot.append('g')
    const pointsGroup = plot.append('g').attr('clip-path', 'url(#scatterClip)')
    const lassoGroup  = plot.append('g')

    //--------------------------------------------------
    // Data — density (x, log) vs speed (y, linear)
    //--------------------------------------------------
    const parsed = data.filter(d =>
      d.flow_speed_kms != null && d.proton_density_ncc != null && d.proton_density_ncc > 0
    ).map(d => ({ ...d, t: new Date(d.datetime) }))

    const densityExt = d3.extent(parsed, d => d.proton_density_ncc)
    const x = d3.scaleLog()
      .domain([Math.max(0.05, densityExt[0] ?? 0.1), Math.max(1, densityExt[1] ?? 50)])
      .range([0, width]).nice()

    const speedExt = d3.extent(parsed, d => d.flow_speed_kms)
    const y = d3.scaleLinear()
      .domain([Math.max(150, (speedExt[0] ?? 250) - 30), (speedExt[1] ?? 900) + 30])
      .range([height, 0]).nice()

    //--------------------------------------------------
    // Grid + axes
    //--------------------------------------------------
    gridGroup.append('g')
      .call(d3.axisLeft(y).tickSize(-width).tickFormat(''))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick line').attr('stroke', '#1E2330'))

    gridGroup.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(6, '~g').tickSize(-height).tickFormat(''))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick line').attr('stroke', '#1E2330'))

    axisGroup.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(6, '~g'))
      .call(g => g.selectAll('text').attr('fill', '#7C8496').attr('font-family', "'JetBrains Mono', monospace"))
      .call(g => g.selectAll('line,path').attr('stroke', '#252B3A'))

    axisGroup.append('g')
      .call(d3.axisLeft(y).ticks(6))
      .call(g => g.selectAll('text').attr('fill', '#7C8496').attr('font-family', "'JetBrains Mono', monospace"))
      .call(g => g.selectAll('line,path').attr('stroke', '#252B3A'))

    //--------------------------------------------------
    // Color scale — active channel
    //--------------------------------------------------
    const ch = CHANNELS.find(c => c.key === channel)
    let colorScale
    if (ch.kind === 'div') {
      const ext = d3.extent(parsed, d => d[ch.key])
      const maxAbs = Math.max(Math.abs(ext[0] || 0), Math.abs(ext[1] || 0)) || 15
      colorScale = d3.scaleSequential().domain([maxAbs, -maxAbs]).interpolator(d3.interpolateRdBu)
    } else if (ch.key === 'kp') {
      colorScale = d3.scaleSequential().domain([0, 9]).interpolator(d3.interpolateViridis)
    } else {
      const ext = d3.extent(parsed, d => d[ch.key])
      colorScale = d3.scaleSequential().domain([ext[0] ?? 0, ext[1] ?? 1]).interpolator(d3.interpolateViridis)
    }

    //--------------------------------------------------
    // Tooltip
    //--------------------------------------------------
    const tooltip = d3.select(wrapRef.current).append('div')
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

    //--------------------------------------------------
    // Scatter
    //--------------------------------------------------
    const selSet = new Set(selectedPoints ?? [])
    const hasSel = selSet.size > 0

    const dots = pointsGroup.selectAll('circle').data(parsed).enter().append('circle')
      .attr('cx', d => x(d.proton_density_ncc))
      .attr('cy', d => y(d.flow_speed_kms))
      .attr('r', 3.5)
      .attr('fill', d => d[ch.key] == null ? '#4B5265' : colorScale(d[ch.key]))
      .attr('fill-opacity', d => hasSel ? (selSet.has(d.datetime) ? 0.9 : 0.12) : 0.75)
      .attr('stroke', d => hasSel && selSet.has(d.datetime) ? '#E7EAF0' : 'none')
      .attr('stroke-width', 1)

    function positionTooltip(event) {
      const wrapEl = wrapRef.current
      const node = tooltip.node()
      const tw = node.offsetWidth, th = node.offsetHeight
      let left = event.offsetX + 15
      let top = event.offsetY - th - 12
      if (left + tw > wrapEl.clientWidth) left = event.offsetX - tw - 15
      if (left < 4) left = 4
      if (top < 4) top = event.offsetY + 15
      if (top + th > wrapEl.clientHeight) top = wrapEl.clientHeight - th - 4
      tooltip.style('left', `${left}px`).style('top', `${top}px`)
    }

    dots.on('mouseover', function (event, d) {
      d3.select(this).transition().duration(100).attr('r', 6).attr('stroke', '#E7EAF0').attr('stroke-width', 1.5)
      tooltip.style('opacity', 1).html(`
        <b>${d.t.toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</b>
        <hr style="border-color:#252B3A">
        Speed : ${d.flow_speed_kms.toFixed(1)} km/s<br>
        Density : ${d.proton_density_ncc.toFixed(2)} n/cc<br>
        ${ch.label} : ${d[ch.key] != null ? d[ch.key].toFixed(2) : '--'}<br>
        Kp : ${d.kp ?? '--'}
      `)
      positionTooltip(event)
    })
      .on('mousemove', (event) => positionTooltip(event))
      .on('mouseout', function () {
        d3.select(this).transition().duration(100).attr('r', 3.5)
          .attr('stroke', d => hasSel && selSet.has(d.datetime) ? '#E7EAF0' : 'none')
        tooltip.style('opacity', 0)
      })

    //--------------------------------------------------
    // Axis labels
    //--------------------------------------------------
    svg.append('text')
      .attr('x', MARGIN.left + width / 2).attr('y', totalHeight - 8)
      .attr('text-anchor', 'middle').attr('fill', '#7C8496').attr('font-size', 11).attr('font-family', "'JetBrains Mono', monospace")
      .text('Proton Density (n/cc, log scale)')

    svg.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -(MARGIN.top + height / 2)).attr('y', 16)
      .attr('text-anchor', 'middle').attr('fill', '#7C8496').attr('font-size', 11).attr('font-family', "'JetBrains Mono', monospace")
      .text('Solar Wind Speed (km/s)')

    //--------------------------------------------------
    // Freehand lasso — one hit-test at mouseup, not per frame
    //--------------------------------------------------
    let lassoPts = null
    let lassoPath = null

    svg.on('pointerdown', (event) => {
      if (event.button !== 0) return
      svg.node().setPointerCapture(event.pointerId)
      const [mx, my] = d3.pointer(event, plot.node())
      lassoPts = [[mx, my]]
      lassoPath = lassoGroup.append('path')
        .attr('fill', '#8b5cf6').attr('fill-opacity', 0.06)
        .attr('stroke', '#8b5cf6').attr('stroke-width', 1).attr('stroke-dasharray', '3,3')
      event.preventDefault()
    })

    svg.on('pointermove', (event) => {
      if (!lassoPts) return
      const last = lassoPts[lassoPts.length - 1]
      const [mx, my] = d3.pointer(event, plot.node())
      if (Math.hypot(mx - last[0], my - last[1]) < 3) return   // cap vertex density
      if (lassoPts.length >= 150) return                       // cap total vertices
      lassoPts.push([mx, my])
      lassoPath.attr('d', 'M' + lassoPts.map(p => p.join(',')).join('L'))
    })

    svg.on('pointerup pointercancel', () => {
      if (!lassoPts) return
      const pts = lassoPts
      lassoPts = null
      lassoPath?.remove()
      lassoPath = null

      const [minX, maxX] = d3.extent(pts, p => p[0])
      const [minY, maxY] = d3.extent(pts, p => p[1])
      const tooSmall = pts.length < 5 || (maxX - minX) * (maxY - minY) < 60
      if (tooSmall) {
        if (onSelectPoints) onSelectPoints([])
        return
      }
      const inside = parsed
        .filter(d => d3.polygonContains(pts, [x(d.proton_density_ncc), y(d.flow_speed_kms)]))
        .map(d => d.datetime)
      if (onSelectPoints) onSelectPoints(inside)
    })

  }, [data, sizeTick, channel, selectedPoints, onSelectPoints])

  return (
    <div className="h-full flex flex-col bg-space-panel border border-space-hairline rounded-xl overflow-hidden">
      <div className="flex-none flex items-center gap-2 px-4 py-2 border-b border-space-hairline bg-space-panel-2/60">
        <span className="text-sm font-semibold text-space-text" title="Density vs speed · drag a lasso to select points · color channel toggle on the right">
          Phase Space
        </span>

        <div className="ml-auto flex items-center gap-2 font-mono">
          <div className="flex items-center rounded-md border border-space-hairline overflow-hidden">
            {CHANNELS.map(c => (
              <button
                key={c.key}
                onClick={() => setChannel(c.key)}
                className={`px-2 py-0.5 text-[10px] transition-colors ${
                  channel === c.key ? 'bg-space-violet text-white' : 'bg-space-panel-2 text-space-dim hover:text-space-text'
                }`}
              >
                {c.short}
              </button>
            ))}
          </div>
          <button
            onClick={() => onSelectPoints?.([])}
            title="Clear the lassoed selection"
            className="px-2 py-0.5 text-[10px] rounded bg-space-panel-2 border border-space-hairline text-space-dim hover:text-space-text transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      <div ref={wrapRef} className="relative w-full flex-1 min-h-0 overflow-hidden" style={{ cursor: 'crosshair' }}>
        {!data?.length
          ? <div className="flex items-center justify-center h-full text-space-faint text-sm font-mono">Waiting for data…</div>
          : <svg ref={svgRef} style={{ display: 'block' }} />
        }
      </div>
    </div>
  )
}
