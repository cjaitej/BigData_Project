import { useEffect, useRef, useState, useMemo } from 'react'
import * as d3 from 'd3'
import { useStormDetail } from '../hooks/useStormDetail'
import { pearson } from '../utils/stats'

// Merges the old separate "Storm Comparison" and "Bz → Dst Correlation"
// subpages into one: a shared storm picker drives both the shock-aligned
// comparison charts (left, wider) and the lag-correlation analysis (right).
const CHARTS = [
  { key: 'bz_gsm_nT',         label: 'Bz',    unit: 'nT',   color: '#f87171', signed: true  },
  { key: 'flow_speed_kms',    label: 'Speed', unit: 'km/s', color: '#4ade80', signed: false },
  { key: 'pdyn_computed_nPa', label: 'Pdyn',  unit: 'nPa',  color: '#fbbf24', signed: false },
  { key: 'dst_omni',          label: 'Dst',   unit: 'nT',   color: '#38bdf8', signed: true  },
]
const CHART_GAP = 10
const COMP_MARGIN = { top: 8, right: 16, bottom: 30, left: 46 }

const MAX_LAG = 6
const CURVE_MARGIN = { top: 10, right: 16, bottom: 22, left: 34 }
const SCATTER_MARGIN = { top: 10, right: 16, bottom: 36, left: 50 }

function buildPairs(series, lag) {
  const pairs = []
  for (let k = 0; k + lag < series.length; k++) {
    const bz = series[k].bz_gsm_nT, dst = series[k + lag].dst_omni
    if (bz == null || dst == null) continue
    pairs.push({ bz, dst, i: series[k].i })
  }
  return pairs
}

export default function StormAnalysis({ selectedStorm, stormCatalog }) {
  const [lag, setLag] = useState(0)

  // The comparison storm only affects this view, so it's local state with
  // its own picker in the header — not a global filter.
  const [cmpId, setCmpId] = useState('')
  const compareStorm = useMemo(
    () => (stormCatalog || []).find(s => String(s.id) === cmpId) || null,
    [stormCatalog, cmpId],
  )
  const sortedCatalog = useMemo(() => {
    const rank = { severe: 0, intense: 1, moderate: 2 }
    return [...(stormCatalog || [])].sort((a, b) =>
      (rank[a.intensity] ?? 3) - (rank[b.intensity] ?? 3) || a.peak_dst_nT - b.peak_dst_nT)
  }, [stormCatalog])

  const { data: mainData, error: loadError } = useStormDetail(selectedStorm)
  const { data: cmpData } = useStormDetail(compareStorm)

  const metrics = useMemo(() => {
    if (!mainData) return null
    const vals = k => mainData.series.map(r => r[k]).filter(v => v != null)
    return {
      maxPdyn: Math.max(...vals('pdyn_computed_nPa')),
      minBz:   Math.min(...vals('bz_gsm_nT')),
      minDst:  Math.min(...vals('dst_omni')),
    }
  }, [mainData])

  // r(lag) for every lag 0..MAX_LAG — cheap (7 values), gives the panel its
  // own distinct visual instead of just a bare slider + single number.
  const curve = useMemo(() => {
    if (!mainData) return null
    const out = []
    for (let l = 0; l <= MAX_LAG; l++) {
      const pairs = buildPairs(mainData.series, l)
      const { r, n } = pearson(pairs.map(p => p.bz), pairs.map(p => p.dst))
      out.push({ lag: l, r, n })
    }
    return out
  }, [mainData])
  const pairs = useMemo(() => (mainData ? buildPairs(mainData.series, lag) : []), [mainData, lag])
  const current = curve?.[lag]

  const rowRef = useRef(null)
  const compWrapRef = useRef(null)
  const compSvgRef = useRef(null)
  const curveSvgRef = useRef(null)
  const scatterWrapRef = useRef(null)
  const scatterSvgRef = useRef(null)

  // Single ResizeObserver for the whole two-column row — all three drawing
  // effects below re-measure their own container when this fires.
  const [sizeTick, setSizeTick] = useState(0)
  useEffect(() => {
    if (!rowRef.current) return
    const ro = new ResizeObserver(() => setSizeTick(t => t + 1))
    ro.observe(rowRef.current)
    return () => ro.disconnect()
  }, [])

  // --- Comparison: 4 stacked shock-aligned mini-charts ---
  useEffect(() => {
    if (!compWrapRef.current) return
    // Selection cleared: wipe the previous charts instead of leaving them
    // ghosting under the translucent "pick a storm" overlay.
    if (!mainData) {
      d3.select(compSvgRef.current).selectAll('*').remove()
      d3.select(compWrapRef.current).selectAll('div.sa-tooltip').remove()
      return
    }

    const svg = d3.select(compSvgRef.current)
    svg.selectAll('*').remove()

    const width = compWrapRef.current.clientWidth || 620
    const availH = compWrapRef.current.clientHeight || 320
    const iw = width - COMP_MARGIN.left - COMP_MARGIN.right
    const CH_H = Math.max(30, (availH - COMP_MARGIN.top - COMP_MARGIN.bottom - (CHARTS.length - 1) * CHART_GAP) / CHARTS.length)
    const H = CHARTS.length * (CH_H + CHART_GAP) - CHART_GAP

    svg.attr('width', width).attr('height', availH)
    const g = svg.append('g').attr('transform', `translate(${COMP_MARGIN.left},${COMP_MARGIN.top})`)

    const iExt = d3.extent(mainData.series, d => d.i)
    const x = d3.scaleLinear().domain(iExt).range([0, iw])

    CHARTS.forEach((c, ci) => {
      const top = ci * (CH_H + CHART_GAP)
      const cg = g.append('g').attr('transform', `translate(0,${top})`)

      const vals = mainData.series.map(r => r[c.key])
        .concat(cmpData ? cmpData.series.map(r => r[c.key]) : [])
        .filter(v => v != null)
      let [lo, hi] = vals.length ? d3.extent(vals) : [0, 1]
      if (lo === hi) { lo -= 1; hi += 1 }
      const pad = (hi - lo) * 0.08
      const y = d3.scaleLinear().domain([lo - pad, hi + pad]).range([CH_H, 0])

      cg.append('g')
        .selectAll('line').data(y.ticks(3)).join('line')
        .attr('x1', 0).attr('x2', iw).attr('y1', d => y(d)).attr('y2', d => y(d))
        .attr('stroke', '#1E2330').attr('stroke-width', 1)

      cg.append('g')
        .call(d3.axisLeft(y).ticks(3).tickSize(4))
        .call(ax => ax.select('.domain').remove())
        .call(ax => ax.selectAll('.tick line').attr('stroke', '#252B3A'))
        .call(ax => ax.selectAll('.tick text').attr('fill', '#7C8496').attr('font-family', "'JetBrains Mono', monospace").attr('font-size', 9))

      cg.append('text')
        .attr('x', 4).attr('y', 9)
        .attr('fill', c.color).attr('font-size', 10).attr('font-family', "'JetBrains Mono', monospace")
        .text(`${c.label} (${c.unit})`)

      if (c.signed && lo < 0 && hi > 0) {
        cg.append('line')
          .attr('x1', 0).attr('x2', iw).attr('y1', y(0)).attr('y2', y(0))
          .attr('stroke', '#252B3A').attr('stroke-dasharray', '4,3')
      }

      const line = d3.line().defined(d => d[c.key] != null).x(d => x(d.i)).y(d => y(d[c.key]))

      if (cmpData) {
        cg.append('path')
          .datum(cmpData.series)
          .attr('fill', 'none').attr('stroke', '#94a3b8').attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '6 4')
          .attr('d', line)
      }

      cg.append('path')
        .datum(mainData.series)
        .attr('fill', 'none').attr('stroke', c.color).attr('stroke-width', 2)
        .attr('d', line)

      cg.append('line')
        .attr('x1', x(0)).attr('x2', x(0)).attr('y1', 0).attr('y2', CH_H)
        .attr('stroke', '#8b5cf6').attr('stroke-width', 1.5)
    })

    const axisY = CHARTS.length * (CH_H + CHART_GAP) - CHART_GAP
    g.append('g')
      .attr('transform', `translate(0,${axisY + 4})`)
      .call(d3.axisBottom(x).ticks(8).tickFormat(d => (d > 0 ? '+' : '') + d))
      .call(ax => ax.select('.domain').attr('stroke', '#252B3A'))
      .call(ax => ax.selectAll('.tick line').attr('stroke', '#252B3A'))
      .call(ax => ax.selectAll('.tick text').attr('fill', '#7C8496').attr('font-family', "'JetBrains Mono', monospace").attr('font-size', 9))

    g.append('text')
      .attr('x', iw).attr('y', axisY + 24)
      .attr('text-anchor', 'end').attr('fill', '#4B5265').attr('font-size', 9).attr('font-family', "'JetBrains Mono', monospace")
      .text('hours from shock arrival')

    if (cmpData) {
      g.append('text')
        .attr('x', iw).attr('y', -2)
        .attr('text-anchor', 'end').attr('fill', '#7C8496').attr('font-size', 9).attr('font-family', "'JetBrains Mono', monospace")
        .text(`dashed: ${cmpData.storm.start.slice(0, 10)} (aligned at its own shock)`)
    }

    const tooltip = d3.select(compWrapRef.current).selectAll('div.sa-tooltip').data([null]).join('div')
      .attr('class', 'sa-tooltip')
      .style('position', 'absolute').style('pointer-events', 'none')
      .style('background', '#12151C').style('border', '1px solid #252B3A').style('border-radius', '6px')
      .style('padding', '8px').style('font-family', "'JetBrains Mono', monospace").style('font-size', '11px')
      .style('color', '#E7EAF0').style('opacity', 0).style('z-index', 10)

    const cross = g.append('line')
      .attr('y1', 0).attr('y2', axisY)
      .attr('stroke', '#4B5265').attr('stroke-width', 1)
      .style('display', 'none')

    svg.append('rect')
      .attr('x', COMP_MARGIN.left).attr('y', COMP_MARGIN.top)
      .attr('width', iw).attr('height', H)
      .attr('fill', 'transparent').style('cursor', 'crosshair')
      .on('mousemove', function (event) {
        const [mx] = d3.pointer(event, this)
        const iVal = Math.round(x.invert(mx))
        const row = mainData.series.find(r => r.i === iVal)
        if (!row) { cross.style('display', 'none'); tooltip.style('opacity', 0); return }

        cross.style('display', null).attr('x1', x(row.i)).attr('x2', x(row.i))

        tooltip.style('opacity', 1).html(`
          <div style="font-weight:600;margin-bottom:6px;">
            ${row.t.toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
            <span style="color:#7C8496">(${row.i >= 0 ? '+' : ''}${row.i} h)</span>
          </div>
          <hr style="border-color:#252B3A;margin:4px 0"/>
          Bz : ${row.bz_gsm_nT?.toFixed(2) ?? '--'} nT<br/>
          Speed : ${row.flow_speed_kms?.toFixed(0) ?? '--'} km/s<br/>
          Pdyn : ${row.pdyn_computed_nPa?.toFixed(2) ?? '--'} nPa<br/>
          Dst : ${row.dst_omni?.toFixed(0) ?? '--'} nT<br/>
          AE : ${row.ae_index_nT?.toFixed(0) ?? '--'} nT
        `)

        const wrapEl = compWrapRef.current
        const node = tooltip.node()
        const tw = node.offsetWidth, th = node.offsetHeight
        let left = event.offsetX + 16
        let top = event.offsetY - th - 10
        if (left + tw > wrapEl.clientWidth) left = event.offsetX - tw - 16
        if (left < 4) left = 4
        if (top < 4) top = event.offsetY + 16
        if (top + th > wrapEl.clientHeight) top = wrapEl.clientHeight - th - 4
        tooltip.style('left', `${left}px`).style('top', `${top}px`)
      })
      .on('mouseleave', () => { cross.style('display', 'none'); tooltip.style('opacity', 0) })

  }, [mainData, cmpData, sizeTick])

  // --- Correlation: r vs lag curve ---
  useEffect(() => {
    if (!curveSvgRef.current) return
    if (!curve) {
      d3.select(curveSvgRef.current).selectAll('*').remove()
      return
    }
    const el = curveSvgRef.current.parentElement
    const W = el.clientWidth, H = el.clientHeight || 120
    const iw = W - CURVE_MARGIN.left - CURVE_MARGIN.right
    const ih = H - CURVE_MARGIN.top - CURVE_MARGIN.bottom

    const svg = d3.select(curveSvgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', W).attr('height', H)
    const g = svg.append('g').attr('transform', `translate(${CURVE_MARGIN.left},${CURVE_MARGIN.top})`)

    const x = d3.scaleLinear().domain([0, MAX_LAG]).range([0, iw])
    const y = d3.scaleLinear().domain([-1, 1]).range([ih, 0])

    g.append('line')
      .attr('x1', 0).attr('x2', iw).attr('y1', y(0)).attr('y2', y(0))
      .attr('stroke', '#252B3A').attr('stroke-dasharray', '4,3')

    g.append('g')
      .call(d3.axisLeft(y).ticks(3).tickSize(4))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('.tick line').attr('stroke', '#252B3A'))
      .call(ax => ax.selectAll('.tick text').attr('fill', '#7C8496').attr('font-family', "'JetBrains Mono', monospace").attr('font-size', 9))

    g.append('g')
      .attr('transform', `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(MAX_LAG + 1).tickFormat(d3.format('d')).tickSize(4))
      .call(ax => ax.select('.domain').attr('stroke', '#252B3A'))
      .call(ax => ax.selectAll('.tick line').attr('stroke', '#252B3A'))
      .call(ax => ax.selectAll('.tick text').attr('fill', '#7C8496').attr('font-family', "'JetBrains Mono', monospace").attr('font-size', 9))

    const line = d3.line().x(d => x(d.lag)).y(d => y(d.r))
    g.append('path').datum(curve).attr('fill', 'none').attr('stroke', '#8b5cf6').attr('stroke-width', 2).attr('d', line)

    g.selectAll('circle.pt').data(curve).enter().append('circle')
      .attr('class', 'pt')
      .attr('cx', d => x(d.lag)).attr('cy', d => y(d.r)).attr('r', d => d.lag === lag ? 5 : 3)
      .attr('fill', d => d.lag === lag ? '#43D9C8' : '#8b5cf6')
      .attr('stroke', '#0A0C10').attr('stroke-width', d => d.lag === lag ? 1.5 : 0)
      .style('cursor', 'pointer')
      .on('click', (_, d) => setLag(d.lag))

  }, [curve, lag, sizeTick])

  // --- Correlation: Bz(t) vs Dst(t+lag) scatter ---
  useEffect(() => {
    if (!scatterWrapRef.current) return
    if (!mainData) {
      d3.select(scatterSvgRef.current).selectAll('*').remove()
      d3.select(scatterWrapRef.current).selectAll('div.sa-corr-tooltip').remove()
      return
    }
    const W = scatterWrapRef.current.clientWidth
    const H = scatterWrapRef.current.clientHeight || 300
    const iw = W - SCATTER_MARGIN.left - SCATTER_MARGIN.right
    const ih = H - SCATTER_MARGIN.top - SCATTER_MARGIN.bottom

    const svg = d3.select(scatterSvgRef.current)
    svg.selectAll('*').remove()
    d3.select(scatterWrapRef.current).selectAll('div.sa-corr-tooltip').remove()
    svg.attr('width', W).attr('height', H)
    const g = svg.append('g').attr('transform', `translate(${SCATTER_MARGIN.left},${SCATTER_MARGIN.top})`)

    const bzExt = d3.extent(pairs, d => d.bz)
    const dstExt = d3.extent(pairs, d => d.dst)
    const x = d3.scaleLinear().domain(bzExt[0] != null ? bzExt : [-10, 10]).nice().range([0, iw])
    const y = d3.scaleLinear().domain(dstExt[0] != null ? dstExt : [-100, 20]).nice().range([ih, 0])

    g.append('g')
      .call(d3.axisLeft(y).tickSize(-iw).tickFormat(''))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('.tick line').attr('stroke', '#1E2330'))

    g.append('g')
      .attr('transform', `translate(0,${ih})`)
      .call(d3.axisBottom(x).tickSize(-ih).tickFormat(''))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('.tick line').attr('stroke', '#1E2330'))

    g.append('g')
      .attr('transform', `translate(0,${ih})`)
      .call(d3.axisBottom(x))
      .call(ax => ax.selectAll('text').attr('fill', '#7C8496').attr('font-family', "'JetBrains Mono', monospace").attr('font-size', 10))
      .call(ax => ax.selectAll('line,path').attr('stroke', '#252B3A'))

    g.append('g')
      .call(d3.axisLeft(y))
      .call(ax => ax.selectAll('text').attr('fill', '#7C8496').attr('font-family', "'JetBrains Mono', monospace").attr('font-size', 10))
      .call(ax => ax.selectAll('line,path').attr('stroke', '#252B3A'))

    if (dstExt[0] < 0 && dstExt[1] > 0) {
      g.append('line').attr('x1', 0).attr('x2', iw).attr('y1', y(0)).attr('y2', y(0))
        .attr('stroke', '#252B3A').attr('stroke-dasharray', '4,3')
    }
    if (bzExt[0] < 0 && bzExt[1] > 0) {
      g.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 0).attr('y2', ih)
        .attr('stroke', '#252B3A').attr('stroke-dasharray', '4,3')
    }

    svg.append('text')
      .attr('x', SCATTER_MARGIN.left + iw / 2).attr('y', H - 6)
      .attr('text-anchor', 'middle').attr('fill', '#7C8496').attr('font-size', 11).attr('font-family', "'JetBrains Mono', monospace")
      .text('IMF Bz at t (nT)')
    svg.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -(SCATTER_MARGIN.top + ih / 2)).attr('y', 14)
      .attr('text-anchor', 'middle').attr('fill', '#7C8496').attr('font-size', 11).attr('font-family', "'JetBrains Mono', monospace")
      .text(`Dst at t+${lag}h (nT)`)

    const tooltip = d3.select(scatterWrapRef.current).append('div')
      .attr('class', 'sa-corr-tooltip')
      .style('position', 'absolute').style('pointer-events', 'none')
      .style('background', '#12151C').style('border', '1px solid #252B3A').style('border-radius', '6px')
      .style('padding', '8px').style('font-family', "'JetBrains Mono', monospace").style('font-size', '11px')
      .style('color', '#E7EAF0').style('opacity', 0)

    g.selectAll('circle').data(pairs).enter().append('circle')
      .attr('cx', d => x(d.bz)).attr('cy', d => y(d.dst)).attr('r', 3.5)
      .attr('fill', '#8b5cf6').attr('fill-opacity', 0.6)
      .on('mouseover', function (event, d) {
        d3.select(this).transition().duration(100).attr('r', 6).attr('fill-opacity', 1)
        tooltip.style('opacity', 1).html(`
          Bz(t) : ${d.bz.toFixed(2)} nT<br/>
          Dst(t+${lag}h) : ${d.dst.toFixed(0)} nT<br/>
          <span style="color:#7C8496">hour ${d.i >= 0 ? '+' : ''}${d.i} from shock</span>
        `)
        const wrapEl = scatterWrapRef.current
        const node = tooltip.node()
        const tw = node.offsetWidth, th = node.offsetHeight
        let left = event.offsetX + 15
        let top = event.offsetY - th - 12
        if (left + tw > wrapEl.clientWidth) left = event.offsetX - tw - 15
        if (top < 4) top = event.offsetY + 15
        tooltip.style('left', `${left}px`).style('top', `${top}px`)
      })
      .on('mouseout', function () {
        d3.select(this).transition().duration(100).attr('r', 3.5).attr('fill-opacity', 0.6)
        tooltip.style('opacity', 0)
      })

  }, [mainData, pairs, lag, sizeTick])

  return (
    <div className="h-full flex flex-col bg-space-panel border border-space-hairline rounded-xl overflow-hidden">
      <div className="flex-none flex items-center gap-3 px-4 py-2.5 border-b border-space-hairline bg-space-panel-2/60 flex-wrap">
        <span className="text-sm font-semibold text-space-text" title="Auto-detected shock arrival · compare two storms · lag slider drives a live Bz→Dst correlation">
          Storm Analysis
        </span>
        <div className="ml-auto flex items-center gap-2 font-mono text-[10px]">
          <span className="text-space-faint">
            Main storm: <b className="text-space-danger">⚠ jump control</b> above · compare vs
          </span>
          <select
            value={cmpId}
            onChange={e => setCmpId(e.target.value)}
            className="h-6 max-w-56 bg-space-panel-2 border border-space-hairline rounded px-2 text-space-dim text-[10px]"
          >
            <option value="">No comparison</option>
            {sortedCatalog.map(s => (
              <option key={s.id} value={s.id}>{s.start.slice(0, 10)} · {s.intensity} · Dst {Math.round(s.peak_dst_nT)} nT</option>
            ))}
          </select>
        </div>
      </div>

      {mainData && metrics && (
        <div className="flex-none flex items-center gap-4 px-4 py-2.5 border-b border-space-hairline text-[10px] font-mono flex-wrap">
          <span className="text-space-dim">Max Pdyn <b className="text-yellow-400">{metrics.maxPdyn.toFixed(1)}</b> nPa</span>
          <span className="text-space-dim">Min Bz <b className="text-red-400">{metrics.minBz.toFixed(1)}</b> nT</span>
          <span className="text-space-dim">Min Dst <b className="text-sky-400">{metrics.minDst.toFixed(0)}</b> nT</span>
          <div className="h-4 w-px bg-space-hairline" />
          <span className="text-space-dim">Bz→Dst lag</span>
          <input
            type="range" min="0" max={MAX_LAG} step="1" value={lag}
            onChange={e => setLag(Number(e.target.value))}
            className="w-28 accent-space-violet"
          />
          <span className="text-space-text">{lag} h</span>
          <span className="text-space-dim">
            r = <b className="text-space-text">{current?.r != null ? current.r.toFixed(2) : '—'}</b>
            {current && <span className="text-space-faint"> ({current.n} pairs)</span>}
          </span>
        </div>
      )}

      <div className="flex-1 min-h-0 p-4 relative">
        <div ref={rowRef} className="h-full flex gap-4 min-h-0">
          <div ref={compWrapRef} className="flex-[3] min-w-0 min-h-0 relative bg-space-panel-2 rounded-lg border border-space-hairline overflow-hidden">
            <svg ref={compSvgRef} style={{ display: 'block' }} />
          </div>
          <div className="flex-[2] min-w-0 flex flex-col gap-4">
            <div className="h-40 flex-none relative bg-space-panel-2 rounded-lg border border-space-hairline overflow-hidden">
              <svg ref={curveSvgRef} style={{ display: 'block' }} />
              <span className="absolute top-1.5 right-3 text-[9px] font-mono text-space-faint uppercase tracking-wider">r vs. lag (click a point)</span>
            </div>
            <div ref={scatterWrapRef} className="flex-1 min-h-0 relative bg-space-panel-2 rounded-lg border border-space-hairline overflow-hidden">
              <svg ref={scatterSvgRef} style={{ display: 'block' }} />
            </div>
          </div>
        </div>

        {!mainData && (
          <div className="absolute inset-4 flex items-center justify-center bg-space-panel/80 rounded-lg pointer-events-none">
            <span className="text-space-faint text-xs font-mono text-center px-6 max-w-md">
              {loadError ? `Could not load storm: ${loadError}` : 'Pick a storm from the ⚠ jump control above, use ◀ STORM / STORM ▶, or click a storm band in the Event Spectrogram.'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
