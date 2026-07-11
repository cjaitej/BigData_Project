import { useEffect, useRef, useState, useMemo } from 'react'
import * as d3 from 'd3'
import { fetchDay } from '../utils/fetchWindow'
import { magnetopauseR0, flaringAlpha, shueRadius } from '../utils/shue'

// Orbital Exposure Simulator — an Earth-centric static date+hour snapshot
// (not a 30-year playback). Canvas + requestAnimationFrame, Sun to the
// left, Earth centered, orbital shells at TRUE Earth-radii scale:
//   LEO 400 km ≈ 1.06 Re, Polar 850 km ≈ 1.13 Re, MEO 20,200 km ≈ 4.17 Re,
//   GEO 35,786 km ≈ 6.61 Re
//
// Magnetopause: full Shue et al. (1998) angular formula (src/utils/shue.js)
//   r(θ) = r0 · (2 / (1 + cosθ))^α
// During real severe storms r0 can drop below GEO — dayside GEO satellites
// visibly leave the magnetosphere.
//
// Exposure scores per shell (weighted combinations of the *_norm columns,
// thresholds calibrated 1995-2025: safe < 0.34 ≤ elevated < 0.62 ≤ danger):
//   GEO   0.55·mpFactor + 0.30·ae_n + 0.15·imf_n   (mpFactor = clamp((9−r0)/2.4))
//   MEO   0.45·clamp(−Dst/250) + 0.35·ae_n + 0.20·speed_n
//   LEO   0.45·ae_n + 0.35·Kp/9 + 0.20·density_n
//   Polar 0.50·ae_n + 0.30·(1−bz_n) + 0.20·speed_n
// Any GEO satellite whose local r_mp(θ) is below its own radius is flagged.
//
// Decorative-only: stars/corona/streamlines/satellite motion animate every
// frame on wall-clock time; none of it reads or writes app state. The only
// state driving the actual scene is simDate/simHour (+ orbit visibility).

const RE = { LEO: 1.0627, Polar: 1.1334, MEO: 4.1683, GEO: 6.6107 }
const ORBITS = ['LEO', 'Polar', 'MEO', 'GEO']
const N_SATS = { LEO: 5, Polar: 3, MEO: 4, GEO: 4 }
const OMEGA = { LEO: 0.55, Polar: 0.50, MEO: 0.18, GEO: 0.08 }   // cosmetic angular speed, rad/s
const T_SAFE = 0.34, T_DANGER = 0.62

const COL = {
  text: '#E7EAF0', dim: '#7C8496', faint: '#4B5265', hairline: '#252B3A',
  calm: '#4F8CFF', danger: '#FF5B54', fast: '#43D9C8', slow: '#E8A33D',
}
const LEVEL_COLOR = { safe: COL.fast, warn: COL.slow, danger: COL.danger }
const LEVEL_TEXT  = { safe: 'Safe', warn: 'Elevated', danger: 'Danger' }

const ok = v => v != null && Number.isFinite(v)
const clamp01 = v => Math.max(0, Math.min(1, v))
const level = v => (v < T_SAFE ? 'safe' : v < T_DANGER ? 'warn' : 'danger')

function rowValid(r) {
  return !!r && ok(r.bz_gsm_nT) && ok(r.pdyn_computed_nPa) && r.pdyn_computed_nPa > 0 && ok(r.ae_norm)
}

// d3-scale-chromatic's interpolators return "#rrggbb" hex strings — split
// into channels so the aurora glow gradient can vary alpha per stop.
function viridisRgb(t) {
  const hex = d3.interpolateViridis(clamp01(t))
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// Deterministic decorative starfield, generated once and tiled across the canvas.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const STAR_FIELD_W = 1400, STAR_FIELD_H = 900
const STARS = (() => {
  const rnd = mulberry32(1337)
  return Array.from({ length: 220 }, () => ({
    x: rnd() * STAR_FIELD_W, y: rnd() * STAR_FIELD_H,
    r: rnd() * 1.3 + 0.25, tw: rnd() * Math.PI * 2, sp: 0.6 + rnd() * 1.4,
  }))
})()
const EARTH_SPECKLE = (() => {
  const rnd = mulberry32(42)
  return Array.from({ length: 14 }, () => ({
    a: rnd() * Math.PI * 2, d: rnd(), rw: 0.14 + rnd() * 0.16, rh: 0.08 + rnd() * 0.1,
  }))
})()

export default function V5({ simDate, simHour, setSimDate, setSimHour, stormCatalog }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)

  const [visibleOrbits, setVisibleOrbits] = useState(new Set(ORBITS))
  const [day, setDay] = useState([])
  const [dayError, setDayError] = useState(null)

  // Fetch the sim day's hourly rows whenever the date changes.
  useEffect(() => {
    let cancelled = false
    setDayError(null)
    fetchDay(simDate)
      .then(rows => { if (!cancelled) setDay(rows) })
      .catch(e => { if (!cancelled) { setDay([]); setDayError(String(e)) } })
    return () => { cancelled = true }
  }, [simDate])

  // Frame state: the row for simHour (falling back to the nearest valid
  // hour within ±6h — search backward then forward each step, same-day
  // only), the full Shue magnetopause, and per-shell exposure scores.
  // Coefficients ported verbatim from the design spec.
  const frame = useMemo(() => {
    if (!day.length) return null
    let row = day[simHour], usedHour = simHour, fallback = false
    if (!rowValid(row)) {
      for (let d = 1; d <= 6 && !rowValid(row); d++) {
        if (rowValid(day[simHour - d])) { row = day[simHour - d]; usedHour = simHour - d; fallback = true }
        else if (rowValid(day[simHour + d])) { row = day[simHour + d]; usedHour = simHour + d; fallback = true }
      }
    }
    if (!rowValid(row)) {
      const r0 = magnetopauseR0(0, 2), alpha = flaringAlpha(0, 2)
      return { row: null, usedHour: null, fallback: false, mp: { r0, alpha }, scores: null, noData: true }
    }
    const r0 = magnetopauseR0(row.bz_gsm_nT, row.pdyn_computed_nPa)
    const alpha = flaringAlpha(row.bz_gsm_nT, row.pdyn_computed_nPa)
    const mpFactor = clamp01((9 - r0) / 2.4)
    const scores = {
      GEO:   0.55 * mpFactor + 0.30 * row.ae_norm + 0.15 * (row.imf_norm ?? 0),
      MEO:   0.45 * clamp01(-(row.dst_omni ?? 0) / 250) + 0.35 * row.ae_norm + 0.20 * (row.speed_norm ?? 0),
      LEO:   0.45 * row.ae_norm + 0.35 * (row.kp ?? 0) / 9 + 0.20 * (row.density_norm ?? 0),
      Polar: 0.50 * row.ae_norm + 0.30 * (1 - (row.bz_norm ?? 0.5)) + 0.20 * (row.speed_norm ?? 0),
    }
    return { row, usedHour, fallback, mp: { r0, alpha }, scores, noData: false }
  }, [day, simHour])

  // Live-read by the rAF loop without re-triggering the mount-once effect.
  const frameRef = useRef(frame)
  useEffect(() => { frameRef.current = frame }, [frame])
  const visibleOrbitsRef = useRef(visibleOrbits)
  useEffect(() => { visibleOrbitsRef.current = visibleOrbits }, [visibleOrbits])

  // ---- canvas: sizing + the one continuous rAF loop (decorative motion
  // + the actual scene, both driven by frameRef so this effect never
  // needs to restart when simDate/simHour change) ----
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')

    let disposed = false
    let raf = 0
    let t0 = performance.now()
    let clock = 0
    let shockRings = []
    let lastShockClock = -999

    const phases = {}
    for (const o of ORBITS) phases[o] = Array.from({ length: N_SATS[o] }, (_, i) => (i / N_SATS[o]) * 2 * Math.PI)

    function loop(now) {
      if (disposed) return
      const dt = Math.min(0.1, (now - t0) / 1000); t0 = now
      clock += dt
      for (const o of ORBITS) phases[o] = phases[o].map(p => p + OMEGA[o] * dt)
      draw(dt)
      raf = requestAnimationFrame(loop)
    }

    function draw(dt) {
      const W = wrap.clientWidth || 700, H = wrap.clientHeight || 460
      const dpr = window.devicePixelRatio || 1
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = W * dpr; canvas.height = H * dpr
        canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      ctx.font = "11px 'JetBrains Mono', monospace"
      ctx.textBaseline = 'alphabetic'

      drawStars(ctx, W, H, clock)

      const F = frameRef.current
      if (!F) return

      const cx = W * 0.56, cy = H / 2
      const pxRe = Math.min(H / 2 - 34, W * 0.30) / RE.GEO
      const sunX = 46, sunR = 20
      const aeN = F.noData ? 0 : (F.row.ae_norm ?? 0)

      drawSun(ctx, sunX, cy, sunR, clock)
      drawSolarWindStreamlines(ctx, sunX, sunR, cx, cy, pxRe, W, H, F, clock)

      // aurora — soft AE-driven glow ringing the poles
      if (aeN > 0.02) {
        const [r, g, b] = viridisRgb(0.42 + 0.4 * aeN)
        const rg = ctx.createRadialGradient(cx, cy, pxRe * 0.6, cx, cy, pxRe * 2.3)
        rg.addColorStop(0, `rgba(${r},${g},${b},${(0.4 * aeN).toFixed(3)})`)
        rg.addColorStop(1, `rgba(${r},${g},${b},0)`)
        ctx.fillStyle = rg
        ctx.beginPath(); ctx.arc(cx, cy, pxRe * 2.3, 0, 2 * Math.PI); ctx.fill()
      }

      // magnetopause — full Shue r(θ), θ from the sunward axis; Sun is left,
      // so screen-x is flipped (sunward = −x)
      const mpPath = new Path2D()
      let first = true
      for (let deg = -124; deg <= 124; deg += 2) {
        const th = deg * Math.PI / 180
        const r = shueRadius(th, F.mp.r0, F.mp.alpha) * pxRe
        const px = cx - r * Math.cos(th)
        const py = cy + r * Math.sin(th)
        first ? mpPath.moveTo(px, py) : mpPath.lineTo(px, py)
        first = false
      }
      ctx.save()
      ctx.strokeStyle = COL.fast
      ctx.lineWidth = 1.6
      ctx.shadowColor = COL.fast
      ctx.shadowBlur = F.noData ? 0 : 10
      ctx.setLineDash(F.noData ? [6, 5] : [])
      ctx.stroke(mpPath)
      ctx.restore()
      ctx.setLineDash([])
      ctx.fillStyle = COL.dim
      ctx.fillText(`magnetopause r₀ = ${F.mp.r0.toFixed(1)} Re`, Math.max(sunX + 40, cx - F.mp.r0 * pxRe - 168), 22)

      drawDipoleFieldLines(ctx, cx, cy, pxRe, aeN)
      drawEarth(ctx, cx, cy, Math.max(6, pxRe), sunX)

      // impact shockwave — pulses out when any shell crosses into danger
      const impact = F.noData ? 0 : Math.max(F.scores.GEO, F.scores.MEO, F.scores.LEO, F.scores.Polar)
      if (impact > T_SAFE) {
        const t = Math.min(1, (impact - T_SAFE) / (1 - T_SAFE))
        const interval = 2.4 - 1.7 * t
        if (clock - lastShockClock > interval) {
          shockRings.push({
            r: pxRe * 1.05, speed: pxRe * (1.1 + 2.0 * t), maxR: pxRe * (2.6 + 2.6 * t),
            alpha: 0.85, lv: level(impact),
          })
          lastShockClock = clock
        }
      }
      for (let i = shockRings.length - 1; i >= 0; i--) {
        const s = shockRings[i]
        s.r += s.speed * dt
        s.alpha -= dt * (0.9 * s.speed / s.maxR + 0.15)
        if (s.alpha <= 0 || s.r > s.maxR) shockRings.splice(i, 1)
      }
      drawShockRings(ctx, cx, cy, shockRings)

      // orbital shells + satellites
      for (const o of ORBITS) {
        if (!visibleOrbitsRef.current.has(o)) continue
        const R = RE[o] * pxRe
        ctx.save()
        ctx.strokeStyle = 'rgba(148,168,210,0.30)'
        ctx.lineWidth = 0.85
        ctx.setLineDash([1, 3])
        ctx.beginPath()
        if (o === 'Polar') ctx.ellipse(cx, cy, R * 0.35, R, 0, 0, 2 * Math.PI)
        else ctx.arc(cx, cy, R, 0, 2 * Math.PI)
        ctx.stroke()
        ctx.restore()

        ctx.fillStyle = COL.faint
        ctx.fillText(o, cx + (o === 'Polar' ? R * 0.35 : R) * 0.72 + 4, cy + R * 0.72)

        const shellLv = F.noData ? 'safe' : level(F.scores[o])
        for (const p of phases[o]) {
          let sx, sy
          if (o === 'Polar') { sx = cx + R * 0.35 * Math.cos(p); sy = cy + R * Math.sin(p) }
          else { sx = cx + R * Math.cos(p); sy = cy + R * Math.sin(p) }
          const theta = Math.atan2(sy - cy, -(sx - cx))
          const inside = F.noData || Math.hypot(sx - cx, sy - cy) / pxRe < shueRadius(theta, F.mp.r0, F.mp.alpha)
          const lv = !inside ? 'danger' : shellLv
          const col = LEVEL_COLOR[lv]
          ctx.save()
          ctx.shadowColor = col; ctx.shadowBlur = 8
          ctx.fillStyle = col
          ctx.beginPath(); ctx.arc(sx, sy, 3.2, 0, 2 * Math.PI); ctx.fill()
          ctx.restore()
          if (!inside) {
            ctx.strokeStyle = COL.danger; ctx.lineWidth = 1.2
            ctx.beginPath(); ctx.arc(sx, sy, 6.5, 0, 2 * Math.PI); ctx.stroke()
          }
        }
      }

      legendChip(ctx, 12, H - 14, LEVEL_COLOR.safe, 'Safe')
      legendChip(ctx, 78, H - 14, LEVEL_COLOR.warn, 'Elevated')
      legendChip(ctx, 168, H - 14, LEVEL_COLOR.danger, 'Danger / outside magnetopause')
    }

    raf = requestAnimationFrame(loop)
    return () => { disposed = true; cancelAnimationFrame(raf) }
  }, [])

  return (
    <div className="h-full flex flex-col bg-space-panel border border-space-hairline rounded-xl overflow-hidden">
      <div className="flex-none flex items-center gap-2 px-4 py-2 border-b border-space-hairline bg-space-panel-2/60">
        <span className="text-sm font-semibold text-space-text">Orbital Exposure Simulator</span>
        <span className="hidden xl:block text-[10px] font-mono text-space-faint">
          · true-scale LEO/Polar/MEO/GEO shells · full Shue magnetopause · a storm click elsewhere jumps this snapshot
        </span>
      </div>

      <div className="flex-1 min-h-0 flex gap-2 p-2">
        <div ref={wrapRef} className="relative flex-1 min-w-0 rounded-lg overflow-hidden"
          style={{ background: 'radial-gradient(ellipse at 50% 40%, #0d1118 0%, #060810 70%, #030405 100%)' }}>
          <canvas ref={canvasRef} className="block w-full h-full" />
          {dayError && (
            <div className="absolute inset-0 flex items-center justify-center text-space-danger text-xs font-mono text-center px-6">
              Could not load {simDate}: {dayError}
            </div>
          )}
        </div>

        <V5Sidebar
          simDate={simDate} simHour={simHour} setSimDate={setSimDate} setSimHour={setSimHour}
          visibleOrbits={visibleOrbits} setVisibleOrbits={setVisibleOrbits}
          stormCatalog={stormCatalog} frame={frame}
        />
      </div>
    </div>
  )
}

//--------------------------------------------------
// Sidebar: controls + exact-value readout + exposure chips
//--------------------------------------------------
function V5Sidebar({ simDate, simHour, setSimDate, setSimHour, visibleOrbits, setVisibleOrbits, stormCatalog, frame }) {
  const sortedStorms = useMemo(() => {
    const rank = { severe: 0, intense: 1, moderate: 2 }
    return [...(stormCatalog || [])]
      .sort((a, b) => (rank[a.intensity] ?? 3) - (rank[b.intensity] ?? 3) || a.peak_dst_nT - b.peak_dst_nT)
      .slice(0, 12)
  }, [stormCatalog])

  function toggleOrbit(o) {
    setVisibleOrbits(prev => {
      const next = new Set(prev)
      next.has(o) ? next.delete(o) : next.add(o)
      return next
    })
  }

  function jumpToStorm(id) {
    const s = sortedStorms.find(st => String(st.id) === id)
    if (!s?.peak_time) return
    const peak = s.peak_time.endsWith('Z') ? s.peak_time.slice(0, -1) : s.peak_time
    setSimDate(peak.slice(0, 10))
    setSimHour(Number(peak.slice(11, 13)))
  }

  return (
    <div className="flex-none w-64 flex flex-col gap-2 overflow-y-auto font-mono text-[11px]">
      {/* Controls */}
      <div className="rounded-lg bg-space-panel-2 border border-space-hairline p-2.5 flex flex-col gap-2">
        <label className="flex items-center justify-between gap-2 text-space-dim">
          Date
          <input type="date" value={simDate} min="1995-01-01" max="2025-12-31"
            onChange={e => setSimDate(e.target.value)}
            className="bg-space-panel border border-space-hairline rounded px-1.5 py-0.5 text-space-text text-[10px]" />
        </label>
        <label className="flex flex-col gap-1 text-space-dim">
          <span className="flex items-center justify-between">Hour <b className="text-space-text">{String(simHour).padStart(2, '0')}:00 UT</b></span>
          <input type="range" min="0" max="23" step="1" value={simHour}
            onChange={e => setSimHour(Number(e.target.value))}
            className="w-full accent-space-violet" />
        </label>
        <div className="flex items-center gap-3 flex-wrap text-space-faint text-[10px]">
          {ORBITS.map(o => (
            <label key={o} className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={visibleOrbits.has(o)} onChange={() => toggleOrbit(o)} className="accent-space-fast" />
              {o}
            </label>
          ))}
        </div>
        {sortedStorms.length > 0 && (
          <select
            defaultValue=""
            onChange={e => { jumpToStorm(e.target.value); e.target.value = '' }}
            className="bg-space-panel border border-space-hairline rounded px-1.5 py-1 text-space-dim text-[10px]"
          >
            <option value="">⚠ jump to storm…</option>
            {sortedStorms.map(s => (
              <option key={s.id} value={s.id}>{s.start.slice(0, 10)} · {s.intensity} · {Math.round(s.peak_dst_nT)} nT</option>
            ))}
          </select>
        )}
      </div>

      <ReadoutPanel frame={frame} />
    </div>
  )
}

function ReadoutPanel({ frame }) {
  if (!frame) {
    return <div className="rounded-lg bg-space-panel-2 border border-space-hairline p-2.5 text-space-faint">loading…</div>
  }
  if (frame.noData) {
    return (
      <div className="rounded-lg bg-space-panel-2 border border-space-hairline p-2.5 text-space-faint leading-relaxed">
        No usable measurements within ±6 h of the chosen hour (instrument saturation). Showing a dashed default magnetopause (Bz 0 nT, Pdyn 2 nPa).
      </div>
    )
  }

  const r = frame.row
  const rows = [
    ['Bz', r.bz_gsm_nT?.toFixed(1), 'nT'],
    ['|B|', r.imf_mag_scalar_nT?.toFixed(1), 'nT'],
    ['Speed', r.flow_speed_kms?.toFixed(0), 'km/s'],
    ['Density', r.proton_density_ncc?.toFixed(1), 'n/cc'],
    ['Pdyn', r.pdyn_computed_nPa?.toFixed(1), 'nPa'],
    ['AE', r.ae_index_nT?.toFixed(0), 'nT'],
    ['Dst', r.dst_omni?.toFixed(0), 'nT'],
    ['Kp', r.kp, ''],
    ['Magnetopause r₀', frame.mp.r0.toFixed(2), 'Re'],
  ]

  return (
    <div className="rounded-lg bg-space-panel-2 border border-space-hairline p-2.5 flex flex-col gap-2">
      {frame.fallback && (
        <div className="text-space-slow text-[10px]">⚠ this hour has a gap — showing {String(frame.usedHour).padStart(2, '0')}:00 UT instead</div>
      )}
      <table className="w-full">
        <tbody>
          {rows.map(([k, v, u]) => (
            <tr key={k}>
              <td className="text-space-faint py-0.5">{k}</td>
              <td className="text-right py-0.5"><b className="text-space-text">{v ?? '—'}</b>{u && <span className="text-space-faint ml-1">{u}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="text-space-faint uppercase tracking-wider text-[9px] mt-1">shell exposure</div>
      {ORBITS.map(o => {
        const lv = level(frame.scores[o])
        return (
          <div key={o} className="flex items-center justify-between">
            <span className="text-space-dim">{o}</span>
            <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ color: LEVEL_COLOR[lv], background: `${LEVEL_COLOR[lv]}1a`, border: `1px solid ${LEVEL_COLOR[lv]}` }}>
              {LEVEL_TEXT[lv]} · {frame.scores[o].toFixed(2)}
            </span>
          </div>
        )
      })}

      {frame.mp.r0 < RE.GEO && (
        <div className="text-space-slow text-[10px] mt-1">⚠ magnetopause inside GEO — dayside GEO satellites are outside the magnetosphere</div>
      )}
    </div>
  )
}

//--------------------------------------------------
// Canvas drawing helpers
//--------------------------------------------------

function drawStars(ctx, W, H, clock) {
  const tilesX = Math.ceil(W / STAR_FIELD_W) + 1
  const tilesY = Math.ceil(H / STAR_FIELD_H) + 1
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const ox = tx * STAR_FIELD_W, oy = ty * STAR_FIELD_H
      for (const s of STARS) {
        const x = ox + s.x, y = oy + s.y
        if (x > W || y > H) continue
        const tw = 0.55 + 0.45 * Math.sin(clock * s.sp + s.tw)
        ctx.fillStyle = `rgba(220,232,255,${(0.35 + 0.5 * tw).toFixed(2)})`
        ctx.beginPath(); ctx.arc(x, y, s.r, 0, 2 * Math.PI); ctx.fill()
      }
    }
  }
}

function drawSun(ctx, sx, sy, r, clock) {
  const pulse = 1 + 0.03 * Math.sin(clock * 1.3)
  const corona = ctx.createRadialGradient(sx, sy, r * 0.6, sx, sy, r * 5.2)
  corona.addColorStop(0, 'rgba(255,196,120,0.30)')
  corona.addColorStop(0.35, 'rgba(255,150,80,0.14)')
  corona.addColorStop(1, 'rgba(255,120,60,0)')
  ctx.fillStyle = corona
  ctx.beginPath(); ctx.arc(sx, sy, r * 5.2, 0, 2 * Math.PI); ctx.fill()

  const glow = ctx.createRadialGradient(sx, sy, r * 0.2, sx, sy, r * 2.2 * pulse)
  glow.addColorStop(0, 'rgba(255,230,180,0.9)')
  glow.addColorStop(0.5, 'rgba(255,170,80,0.35)')
  glow.addColorStop(1, 'rgba(255,120,60,0)')
  ctx.fillStyle = glow
  ctx.beginPath(); ctx.arc(sx, sy, r * 2.2 * pulse, 0, 2 * Math.PI); ctx.fill()

  const disc = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.3, r * 0.1, sx, sy, r)
  disc.addColorStop(0, '#fff6de')
  disc.addColorStop(0.45, '#ffd27a')
  disc.addColorStop(0.8, '#ff9a4d')
  disc.addColorStop(1, '#ff7a3d')
  ctx.save()
  ctx.shadowColor = 'rgba(255,170,90,0.85)'
  ctx.shadowBlur = 24
  ctx.fillStyle = disc
  ctx.beginPath(); ctx.arc(sx, sy, r, 0, 2 * Math.PI); ctx.fill()
  ctx.restore()

  ctx.fillStyle = 'rgba(255,220,180,0.85)'
  ctx.fillText('Sun', sx - 10, sy + r + 16)
}

// Flowing solar-wind streamlines, bent around the magnetopause nose.
function drawSolarWindStreamlines(ctx, sunX, sunR, cx, cy, pxRe, W, H, F, clock) {
  const lanes = 7
  const spread = Math.min(H * 0.42, 190)
  for (let i = 0; i < lanes; i++) {
    const t = lanes === 1 ? 0.5 : i / (lanes - 1)
    const y0 = cy + (t - 0.5) * 2 * spread
    const bend = t - 0.5
    const pts = []
    const steps = 46
    for (let s = 0; s <= steps; s++) {
      const u = s / steps
      const x = sunX + sunR + u * (W - sunX - sunR - 10)
      const distToNose = x - (cx - F.mp.r0 * pxRe)
      let y = y0
      if (distToNose > -40) {
        const push = Math.max(0, 1 - Math.abs(distToNose) / 220)
        y = y0 + bend * push * 130
      }
      pts.push([x, y])
    }
    const grad = ctx.createLinearGradient(sunX, cy, W, cy)
    grad.addColorStop(0, 'rgba(255,180,84,0.55)')
    grad.addColorStop(0.55, 'rgba(255,150,80,0.30)')
    grad.addColorStop(1, 'rgba(255,150,80,0.05)')
    ctx.save()
    ctx.strokeStyle = grad
    ctx.lineWidth = 1
    ctx.setLineDash([10, 9])
    ctx.lineDashOffset = -clock * 40
    ctx.beginPath()
    pts.forEach((p, idx) => (idx ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
    ctx.stroke()
    ctx.restore()
  }
}

function drawDipoleFieldLines(ctx, cx, cy, pxRe, aeN) {
  const loops = [1.6, 2.3, 3.1, 4.0]
  ctx.save()
  ctx.shadowColor = 'rgba(79,216,255,0.55)'
  ctx.shadowBlur = 6
  loops.forEach((k, i) => {
    const rx = pxRe * k * 0.62, ry = pxRe * k
    ctx.strokeStyle = `rgba(120,190,255,${0.22 + 0.05 * aeN - i * 0.03})`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.ellipse(cx, cy, Math.max(2, rx), Math.max(2, ry), Math.PI / 2, 0, 2 * Math.PI)
    ctx.stroke()
  })
  ctx.restore()
}

function drawEarth(ctx, cx, cy, r, sunX) {
  const rim = ctx.createRadialGradient(cx, cy, r * 0.85, cx, cy, r * 1.6)
  rim.addColorStop(0, 'rgba(90,170,255,0.0)')
  rim.addColorStop(0.75, 'rgba(90,170,255,0.22)')
  rim.addColorStop(1, 'rgba(90,170,255,0)')
  ctx.fillStyle = rim
  ctx.beginPath(); ctx.arc(cx, cy, r * 1.6, 0, 2 * Math.PI); ctx.fill()

  const lit = sunX < cx ? -1 : 1
  const sphere = ctx.createRadialGradient(cx + lit * r * 0.45, cy - r * 0.35, r * 0.15, cx, cy, r * 1.05)
  sphere.addColorStop(0, '#bfe4ff')
  sphere.addColorStop(0.35, '#4f9dff')
  sphere.addColorStop(0.7, '#1c4fa8')
  sphere.addColorStop(1, '#08183f')
  ctx.save()
  ctx.shadowColor = 'rgba(79,216,255,0.5)'
  ctx.shadowBlur = 14
  ctx.fillStyle = sphere
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.clip()
  ctx.fillStyle = 'rgba(90,200,140,0.55)'
  for (const p of EARTH_SPECKLE) {
    ctx.beginPath()
    ctx.ellipse(cx + Math.cos(p.a) * p.d * r * 0.9, cy + Math.sin(p.a) * p.d * r * 0.9,
      r * p.rw, r * p.rh, p.a, 0, 2 * Math.PI)
    ctx.fill()
  }
  ctx.restore()

  ctx.fillStyle = COL.dim
  ctx.fillText('Earth', cx - 14, cy + r + 16)
}

function drawShockRings(ctx, cx, cy, rings) {
  for (const s of rings) {
    const col = LEVEL_COLOR[s.lv] ?? COL.fast
    const a = Math.max(0, s.alpha)
    ctx.save()
    ctx.globalAlpha = a
    ctx.strokeStyle = col
    ctx.lineWidth = 1.6
    ctx.shadowColor = col
    ctx.shadowBlur = 14
    ctx.beginPath(); ctx.arc(cx, cy, s.r, 0, 2 * Math.PI); ctx.stroke()
    ctx.globalAlpha = a * 0.4
    ctx.lineWidth = 3.5
    ctx.beginPath(); ctx.arc(cx, cy, s.r * 0.94, 0, 2 * Math.PI); ctx.stroke()
    ctx.restore()
  }
}

function legendChip(ctx, x, y, col, label) {
  ctx.save()
  ctx.shadowColor = col; ctx.shadowBlur = 6
  ctx.fillStyle = col
  ctx.beginPath(); ctx.arc(x + 4, y - 4, 4, 0, 2 * Math.PI); ctx.fill()
  ctx.restore()
  ctx.fillStyle = COL.dim
  ctx.fillText(label, x + 13, y)
}
