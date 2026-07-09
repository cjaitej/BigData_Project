import { useEffect, useRef } from 'react'

// Ported from V2_And_V5/v5.html. The simulator is plain canvas code, so it
// lives in one mount-only effect; React never re-renders this subtree, all
// DOM updates happen imperatively inside the animation loop.
// Data comes from the Flask API (/api/orbital/daily + /api/orbital/storms).
//
// Linked-view hub:
//  - while PLAYING, the sim broadcasts the shared hoverTime cursor whenever
//    the playhead is inside the dashboard's loaded range (V1/V2/V3 follow)
//  - while PAUSED, the sim follows hoverTime coming from the other panels
//  - the dashboard range + brushed selection are drawn on the 30-year
//    timeline as indigo bands
//  - picking a storm (dropdown / clicking Earth mid-storm) loads that
//    storm's window into the whole dashboard via applyRange()

const V5_CSS = `
  #v5-root{
    --bg:#0A0C10;
    --panel:#12151C;
    --panel-2:#0E1117;
    --grid:#1E2330;
    --hairline:#252B3A;
    --text:#E7EAF0;
    --text-dim:#7C8496;
    --text-faint:#4B5265;
    --slow:#E8A33D;
    --fast:#43D9C8;
    --cme:#C65FE8;
    --danger:#FF5B54;
    --calm:#4F8CFF;
    --aurora:#5CF2A0;
    --mono: 'JetBrains Mono', monospace;
    --sans: 'Space Grotesk', sans-serif;
    display:flex;
    flex-direction:column;
    height:100%;
    min-height:0;
    gap:8px;
    background:var(--bg);
    padding:10px;
    color:var(--text);
    font-family:var(--sans);
  }
  #v5-root *{box-sizing:border-box;}

  .v5-sub{
    font-size:11px;
    color:var(--text-faint);
    font-family:var(--mono);
  }

  .v5-main{ flex:1; display:flex; flex-direction:column; gap:8px; min-width:0; min-height:0; }

  .v5-canvas-wrap{
    background:radial-gradient(ellipse at 50% 40%, #0d1118 0%, #060810 70%, #030405 100%);
    border:1px solid var(--hairline);
    border-radius:8px;
    position:relative;
    overflow:hidden;
    flex:1;
    min-height:140px;
  }
  #v5-canvas{ display:block; width:100%; height:100%; cursor:default; }

  .v5-scanline{
    position:absolute; inset:0; pointer-events:none;
    background: repeating-linear-gradient(to bottom, rgba(255,255,255,0.012) 0px, rgba(255,255,255,0.012) 1px, transparent 1px, transparent 3px);
    mix-blend-mode: overlay;
  }

  .v5-storm-banner{
    position:absolute; top:10px; left:50%; transform:translateX(-50%);
    font-family:var(--mono); font-size:10px; letter-spacing:0.05em; text-transform:uppercase;
    padding:5px 12px; border-radius:20px; border:1px solid var(--danger);
    background:rgba(255,91,84,0.12); color:var(--danger);
    display:none; align-items:center; gap:8px;
    animation: v5-pulse 1.4s ease-in-out infinite;
    pointer-events:none;
    white-space:nowrap;
    max-width:calc(100% - 190px);
    overflow:hidden; text-overflow:ellipsis;
    z-index:3;
  }
  @keyframes v5-pulse{ 0%,100%{opacity:0.85;} 50%{opacity:1;box-shadow:0 0 14px rgba(255,91,84,0.35);} }

  .v5-mag-monitor{
    position:absolute; top:10px; right:10px;
    background:rgba(14,17,23,0.86);
    border:1px solid var(--hairline);
    border-radius:8px;
    padding:7px 8px 6px;
    pointer-events:none;
    z-index:4;
  }
  .v5-mag-monitor-title{
    font-family:var(--mono); font-size:8.5px; letter-spacing:0.09em; text-transform:uppercase;
    color:var(--text-faint); margin-bottom:3px; text-align:center;
  }
  #v5-mag-canvas{ display:block; }
  .v5-mag-status{
    font-family:var(--mono); font-size:9.5px; letter-spacing:0.04em; text-transform:uppercase;
    text-align:center; margin-top:3px; white-space:nowrap;
  }
  .v5-mag-status.pulse{ animation: v5-flash 1s ease-in-out infinite; }

  .v5-loading{
    position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
    font-family:var(--mono); font-size:11px; color:var(--text-faint);
  }

  /* compact conditions readout — overlays the canvas, bottom-left */
  .v5-readout{
    position:absolute; left:10px; bottom:10px;
    display:flex; align-items:center; gap:10px; flex-wrap:wrap;
    background:rgba(14,17,23,0.85);
    border:1px solid var(--hairline); border-radius:8px;
    padding:5px 10px;
    font-family:var(--mono); font-size:10px; color:var(--text-faint);
    letter-spacing:0.04em; text-transform:uppercase;
    pointer-events:none; z-index:4;
    max-width:calc(100% - 20px);
  }
  .v5-ro b{ color:var(--text); font-weight:500; margin-left:2px; }
  .v5-ro b.ok{ color:var(--fast); }
  .v5-ro b.warn{ color:var(--slow); }
  .v5-ro b.bad{ color:var(--danger); }
  .v5-ro b.flash{ animation: v5-flash 1s ease-in-out infinite; }
  @keyframes v5-flash{ 0%,100%{opacity:1;} 50%{opacity:0.45;} }

  .v5-legend-overlay{
    position:absolute; right:10px; bottom:10px;
    display:flex; flex-direction:column; gap:3px;
    background:rgba(14,17,23,0.75);
    border:1px solid var(--hairline); border-radius:8px;
    padding:5px 8px;
    font-family:var(--mono); font-size:9px; color:var(--text-dim);
    pointer-events:none; z-index:4;
  }
  .v5-legend-row{ display:flex; align-items:center; gap:6px; }
  .v5-legend-dot{ width:7px; height:7px; border-radius:50%; flex:0 0 auto; }

  .v5-regime-badge{ display:inline-block; font-family:var(--mono); font-size:10px; letter-spacing:0.05em; text-transform:uppercase; padding:1px 8px; border-radius:10px; border:1px solid; }
  .v5-regime-slow{ color:var(--slow); border-color:var(--slow); background:rgba(232,163,61,0.1); }
  .v5-regime-fast{ color:var(--fast); border-color:var(--fast); background:rgba(67,217,200,0.1); }
  .v5-regime-cme{ color:var(--cme); border-color:var(--cme); background:rgba(198,95,232,0.1); }
  .v5-regime-unknown{ color:var(--text-faint); border-color:var(--hairline); background:transparent; }

  .v5-timeline-block{ flex:none; background:var(--panel-2); border:1px solid var(--hairline); border-radius:8px; padding:8px 12px 6px; }
  .v5-timeline-top{ display:flex; justify-content:space-between; align-items:baseline; margin-bottom:2px; }
  .v5-date-readout{ font-family:var(--mono); font-size:13px; color:var(--text); letter-spacing:0.03em; }
  .v5-date-readout .v5-day-of{ color:var(--text-faint); font-size:10px; margin-left:6px; }
  #v5-timeline{ display:block; width:100%; height:52px; cursor:pointer; }

  .v5-controls{ display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:6px; }
  .v5-btn{
    font-family:var(--mono); font-size:10px; letter-spacing:0.03em; text-transform:uppercase;
    background:var(--panel); border:1px solid var(--hairline); color:var(--text-dim);
    padding:4px 8px; border-radius:6px; cursor:pointer; transition:all 120ms ease;
  }
  .v5-btn:hover{ color:var(--text); border-color:var(--fast); }
  .v5-btn.active{ color:var(--bg); background:var(--fast); border-color:var(--fast); }
  select.v5-btn{ appearance:none; -webkit-appearance:none; padding-right:20px;
    background-image: linear-gradient(45deg, transparent 50%, var(--text-faint) 50%), linear-gradient(135deg, var(--text-faint) 50%, transparent 50%);
    background-position: calc(100% - 11px) center, calc(100% - 7px) center; background-size:4px 4px, 4px 4px; background-repeat:no-repeat;
  }
  #v5-storm-select{ max-width:230px; overflow:hidden; text-overflow:ellipsis; color:var(--danger); border-color:rgba(255,91,84,0.4); }
  .v5-toggles{ display:flex; gap:10px; margin-left:auto; font-family:var(--mono); font-size:9px; color:var(--text-faint); letter-spacing:0.04em; text-transform:uppercase; }
  .v5-toggles label{ display:flex; align-items:center; gap:4px; cursor:pointer; }
  .v5-toggles input{ accent-color:var(--fast); }

  .v5-tooltip{
    position:absolute; pointer-events:none; font-family:var(--mono); font-size:10px;
    background:var(--panel); border:1px solid var(--hairline); border-radius:5px; padding:4px 7px;
    color:var(--text-dim); white-space:nowrap; transform:translate(-50%,-130%); display:none; z-index:5;
  }
`

export default function V5({ start, end, hoverTime, setHoverTime, selection, applyRange }) {
  const rootRef = useRef(null)
  const apiRef = useRef(null)

  // Live props for the imperative sim (mount-only effect reads this ref)
  const linkRef = useRef({})
  useEffect(() => {
    linkRef.current = { start, end, selection, applyRange, setHoverTime }
  })

  useEffect(() => {
    const rootEl = rootRef.current
    if (!rootEl) return
    const $ = id => rootEl.querySelector('#' + id)

    const wrap = $('v5-canvas-wrap')
    const canvas = $('v5-canvas')
    const ctx = canvas.getContext('2d')
    const tlCanvas = $('v5-timeline')
    const tlCtx = tlCanvas.getContext('2d')
    const tooltip = $('v5-tooltip')
    const loadingEl = $('v5-loading')
    const bannerEl = $('v5-storm-banner')
    const dateReadout = $('v5-date-readout')
    const magCanvas = $('v5-mag-canvas')
    const magCtx = magCanvas ? magCanvas.getContext('2d') : null
    const magStatusEl = $('v5-mag-status')
    const MAG_W = 130, MAG_H = 84

    const cssVars = getComputedStyle($('v5-root'))
    const COL = k => (cssVars.getPropertyValue(k) || '').trim() || '#888'
    const C_FAST = COL('--fast'), C_SLOW = COL('--slow'), C_CME = COL('--cme'),
          C_DANGER = COL('--danger'), C_CALM = COL('--calm'), C_AURORA = COL('--aurora'),
          C_HAIR = COL('--hairline'), C_TEXTFAINT = COL('--text-faint')

    const PLANETS = [
      { name:'Mercury', period:88,     radiusFactor:0.13, size:2.6, color:'#9C9B8E' },
      { name:'Venus',   period:225,    radiusFactor:0.20, size:4.6, color:'#E8C07D' },
      { name:'Earth',   period:365.25, radiusFactor:0.30, size:10.4, color:'#4F8CFF', isEarth:true },
      { name:'Mars',    period:687,    radiusFactor:0.40, size:3.6, color:'#D96B4A' },
    ]

    let daily = [], storms = [], stormById = {}, dayStormId = [], dayIntensity = []
    let totalDays = 0, startDate = null
    let simDay = 0, playing = true, daysPerSecond = 5, lastTs = null, tGlobal = 0
    let prevStormId = null
    let cmes = [], shockRings = [], flashAlpha = 0
    let showWind = true, showOrbits = true, showLabels = true
    let dragging = false
    let stars = []
    let windParticles = []
    let dpr = Math.max(1, window.devicePixelRatio || 1)
    let W = 0, H = 0, cx = 0, cy = 0, scale = 0
    let earthAngle = 0, earthX = 0, earthY = 0, earthOrbitR = 0
    let stormZoom = 1, stormZoomTarget = 1, userZoom = 1.35, zoom = 1
    const USER_ZOOM_MIN = 0.7, USER_ZOOM_MAX = 2.6

    // linked-view state
    let lastSentDay = null, lastSentTs = 0, wasInRange = false
    let suppressRangeSeek = false

    // effect lifecycle (StrictMode double-mount safe)
    let disposed = false, rafId = 0, resizeObserver = null
    const ac = new AbortController()

    // A few well-known historical storms, matched to the nearest detected
    // event by peak date (within 3 days). Everything else just gets a
    // plain "Storm #id" label — this is cosmetic, not a claim about every
    // storm in the dataset being independently verified against history.
    const NAMED_STORMS = [
      { date:'1998-05-04', name:'May 1998 Storm' },
      { date:'2000-07-15', name:'Bastille Day Storm' },
      { date:'2001-03-31', name:'March 2001 Storm' },
      { date:'2003-10-29', name:'Halloween Storm' },
      { date:'2003-10-30', name:'Halloween Storm' },
      { date:'2004-11-08', name:'November 2004 Storm' },
      { date:'2005-05-15', name:'May 2005 Storm' },
      { date:'2015-03-17', name:"St Patrick's Day Storm" },
      { date:'2024-05-10', name:'Gannon Storm' },
      { date:'2024-05-11', name:'Gannon Storm' },
    ]
    function namedStormFor(storm){
      const peak = new Date(storm.peak_time).getTime()
      let best = null, bestDiff = Infinity
      NAMED_STORMS.forEach(n=>{
        const diff = Math.abs(new Date(n.date+'T00:00:00Z').getTime() - peak)
        if(diff < bestDiff){ bestDiff = diff; best = n }
      })
      if(best && bestDiff <= 3*86400000) return best.name
      return `Storm #${storm.id}`
    }

    function dayIndexFromISO(iso){
      const d = new Date(iso)
      const d0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      return Math.round((d0 - startDate.getTime()) / 86400000)
    }

    // day index for a local Date coming from the other panels (their
    // datetimes are parsed timezone-naive, i.e. local)
    function dayIndexFromLocal(t){
      return Math.round((Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) - startDate.getTime()) / 86400000)
    }

    function fmtDate(idx){
      const t = new Date(startDate.getTime() + idx * 86400000)
      return t.toISOString().slice(0,10)
    }

    // ---------- linked views ----------
    // While playing (or scrubbing), publish the playhead as the shared
    // hoverTime whenever it's inside the dashboard's loaded range.
    function broadcast(now){
      const link = linkRef.current
      if(!link.setHoverTime || !startDate) return
      const day = Math.floor(simDay)
      const ds = fmtDate(day)
      const inRange = link.start && link.end && ds >= link.start && ds <= link.end
      if(inRange){
        if(day !== lastSentDay && now - lastSentTs > 80){
          lastSentDay = day
          lastSentTs = now
          wasInRange = true
          link.setHoverTime(new Date(ds + 'T12:00:00'))
        }
      } else if(wasInRange){
        wasInRange = false
        lastSentDay = null
        link.setHoverTime(null)
      }
    }

    // While paused, follow the cursor from V1/V2/V3.
    function onExternalHover(t){
      if(!startDate || playing || dragging || !t) return
      const day = dayIndexFromLocal(t)
      if(day === lastSentDay) return   // our own broadcast echoed back
      const frac = (t.getHours() + t.getMinutes()/60) / 24
      simDay = Math.max(0, Math.min(totalDays-1, day + frac))
    }

    // When the dashboard loads a new range, park the playhead at its start
    // (unless the change originated here via loadStormRange).
    function onRangeChange(){
      if(!startDate) return
      if(suppressRangeSeek){ suppressRangeSeek = false; return }
      const link = linkRef.current
      if(!link.start) return
      const idx = dayIndexFromISO(link.start + 'T00:00:00Z')
      if(Number.isFinite(idx)) simDay = Math.max(0, Math.min(totalDays-1, idx))
    }

    // Load a storm's window into every other panel.
    function loadStormRange(s){
      const link = linkRef.current
      if(!link.applyRange) return
      const t0 = new Date(new Date(s.start).getTime() - 2*86400000)
      const t1 = new Date(new Date(s.end).getTime() + 3*86400000)
      suppressRangeSeek = true
      link.applyRange(t0.toISOString().slice(0,10), t1.toISOString().slice(0,10))
    }

    apiRef.current = { onExternalHover, onRangeChange }

    // ---------- load ----------
    Promise.all([
      fetch('/api/orbital/daily',  { signal: ac.signal }).then(r=>{ if(!r.ok) throw new Error('daily '+r.status); return r.json() }),
      fetch('/api/orbital/storms', { signal: ac.signal }).then(r=>{ if(!r.ok) throw new Error('storms '+r.status); return r.json() })
    ]).then(([dailyRows, stormRows])=>{
      if(disposed) return
      init(dailyRows, stormRows)
      loadingEl.style.display = 'none'
    }).catch(err=>{
      if(disposed || err.name === 'AbortError') return
      console.error('V5 data load failed:', err)
      loadingEl.textContent = 'could not load orbital data — is the Flask server running on port 5000?'
      loadingEl.style.color = C_DANGER
    })

    function init(dailyRows, stormRows){
      daily = dailyRows
      totalDays = daily.length
      startDate = new Date(daily[0].t)
      storms = stormRows
      storms.forEach(s => stormById[s.id] = s)

      dayStormId = new Array(totalDays).fill(null)
      dayIntensity = new Array(totalDays).fill(null)
      storms.forEach(s=>{
        const sd = Math.max(0, dayIndexFromISO(s.start))
        const ed = Math.min(totalDays-1, dayIndexFromISO(s.end))
        for(let d=sd; d<=ed; d++){ dayStormId[d] = s.id; dayIntensity[d] = s.intensity }
      })

      $('v5-count').textContent =
        `${totalDays.toLocaleString()} days · 1995–2025 · ${storms.length} storms`
      $('v5-storm-count-sub').textContent =
        `${storms.filter(s=>s.intensity==='severe').length} severe · ${storms.filter(s=>s.intensity==='intense').length} intense · ${storms.filter(s=>s.intensity==='moderate').length} moderate`

      populateStormSelect()
      bindControls()
      resize()
      resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(wrap)
      onRangeChange()   // park playhead at the dashboard's current range
      rafId = requestAnimationFrame(loop)
    }

    // ---------- sizing ----------
    function resize(){
      const rect = wrap.getBoundingClientRect()
      W = Math.max(280, rect.width)
      H = Math.max(140, rect.height)
      canvas.width = W * dpr; canvas.height = H * dpr
      canvas.style.width = W+'px'; canvas.style.height = H+'px'
      ctx.setTransform(dpr,0,0,dpr,0,0)

      cx = W/2; cy = H/2
      scale = Math.min(W,H) * 0.46

      const tlRect = tlCanvas.getBoundingClientRect()
      tlCanvas.width = tlRect.width * dpr; tlCanvas.height = 52 * dpr
      tlCanvas.style.height = '52px'
      tlCtx.setTransform(dpr,0,0,dpr,0,0)

      buildStars()
      buildWindParticles()

      if(magCanvas && magCtx){
        magCanvas.width = MAG_W * dpr; magCanvas.height = MAG_H * dpr
        magCanvas.style.width = MAG_W + 'px'; magCanvas.style.height = MAG_H + 'px'
        magCtx.setTransform(dpr,0,0,dpr,0,0)
      }
    }

    function buildStars(){
      stars = []
      const n = Math.floor((W*H)/2200)
      for(let i=0;i<n;i++){
        stars.push({
          x: Math.random()*W, y: Math.random()*H,
          r: Math.random()*1.2 + 0.2,
          baseAlpha: Math.random()*0.5 + 0.2,
          speed: Math.random()*1.5 + 0.4,
          phase: Math.random()*Math.PI*2
        })
      }
    }

    function buildWindParticles(){
      windParticles = []
      const n = 150
      const maxR = scale * 0.5
      const sunR = scale * 0.055
      for(let i=0;i<n;i++){
        windParticles.push({
          angle: Math.random()*Math.PI*2,
          r: sunR + Math.random()*maxR,
          speedFactor: 0.7 + Math.random()*0.6
        })
      }
    }

    // ---------- controls ----------
    const onWindowMouseMove = e => {
      if(dragging) seekFromEvent(e)
      handleTooltip(e)
    }
    const onWindowMouseUp = () => { dragging = false }

    function bindControls(){
      const playBtn = $('v5-play')
      playBtn.addEventListener('click', ()=>{
        playing = !playing
        playBtn.textContent = playing ? '⏸ PAUSE' : '▶ PLAY'
        playBtn.classList.toggle('active', playing)
      })
      playBtn.classList.add('active')

      $('v5-speed').addEventListener('change', (e)=>{
        daysPerSecond = parseFloat(e.target.value)
      })

      $('v5-prev-storm').addEventListener('click', ()=>{
        const cur = Math.floor(simDay)
        const cands = storms.map(s=>dayIndexFromISO(s.peak_time)).filter(d=>d < cur - 1)
        if(cands.length){ simDay = Math.max(...cands); playing=false; updatePlayUI() }
      })
      $('v5-next-storm').addEventListener('click', ()=>{
        const cur = Math.floor(simDay)
        const cands = storms.map(s=>dayIndexFromISO(s.peak_time)).filter(d=>d > cur + 1)
        if(cands.length){ simDay = Math.min(...cands); playing=false; updatePlayUI() }
      })

      $('v5-toggle-wind').addEventListener('change', e=> showWind = e.target.checked)
      $('v5-toggle-orbits').addEventListener('change', e=> showOrbits = e.target.checked)
      $('v5-toggle-labels').addEventListener('change', e=> showLabels = e.target.checked)

      $('v5-zoom-in').addEventListener('click', ()=>{
        userZoom = Math.min(USER_ZOOM_MAX, userZoom * 1.18)
      })
      $('v5-zoom-out').addEventListener('click', ()=>{
        userZoom = Math.max(USER_ZOOM_MIN, userZoom / 1.18)
      })
      canvas.addEventListener('wheel', e=>{
        e.preventDefault()
        const factor = e.deltaY < 0 ? 1.08 : 0.92
        userZoom = Math.min(USER_ZOOM_MAX, Math.max(USER_ZOOM_MIN, userZoom * factor))
      }, { passive:false })

      tlCanvas.addEventListener('mousedown', e=>{ dragging = true; seekFromEvent(e) })
      window.addEventListener('mousemove', onWindowMouseMove)
      window.addEventListener('mouseup', onWindowMouseUp)
      tlCanvas.addEventListener('mouseleave', ()=> tooltip.style.display='none')

      canvas.addEventListener('mousedown', e=>{
        const rect = canvas.getBoundingClientRect()
        const mx = e.clientX-rect.left, my = e.clientY-rect.top
        const screenEarthX = cx + (earthX-cx)*zoom, screenEarthY = cy + (earthY-cy)*zoom
        if(Math.hypot(mx-screenEarthX, my-screenEarthY) < 16){
          playing = false; updatePlayUI()
          const idx = Math.floor(simDay)
          if(dayStormId[idx]){
            const s = stormById[dayStormId[idx]]
            jumpToStorm(s)
            loadStormRange(s)
          }
        }
      })
    }

    function updatePlayUI(){
      const playBtn = $('v5-play')
      playBtn.textContent = playing ? '⏸ PAUSE' : '▶ PLAY'
      playBtn.classList.toggle('active', playing)
    }

    function seekFromEvent(e){
      const rect = tlCanvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const pad = 8
      const frac = Math.min(1, Math.max(0, (x-pad)/(rect.width-2*pad)))
      simDay = frac * (totalDays-1)
      lastSentDay = null
      broadcast(performance.now())   // scrubbing publishes the cursor too
    }

    function handleTooltip(e){
      const rect = tlCanvas.getBoundingClientRect()
      if(e.clientY < rect.top-4 || e.clientY > rect.bottom+4 || e.clientX < rect.left || e.clientX > rect.right){
        tooltip.style.display = 'none'; return
      }
      const x = e.clientX - rect.left
      const pad = 8
      const frac = Math.min(1, Math.max(0, (x-pad)/(rect.width-2*pad)))
      const idx = Math.round(frac*(totalDays-1))
      tooltip.textContent = fmtDate(idx)
      tooltip.style.left = (e.clientX - wrap.getBoundingClientRect().left) + 'px'
      tooltip.style.top = (rect.top - wrap.getBoundingClientRect().top) + 'px'
      tooltip.style.display = 'block'
    }

    function jumpToStorm(storm){
      simDay = dayIndexFromISO(storm.peak_time)
      playing = false; updatePlayUI()
    }

    function populateStormSelect(){
      const sel = $('v5-storm-select')
      const list = [...storms].sort((a,b)=>a.peak_dst_nT - b.peak_dst_nT).slice(0,12)
      list.forEach(s=>{
        const o = document.createElement('option')
        o.value = s.id
        o.textContent = `${namedStormFor(s)} · ${s.peak_time.slice(0,10)} · ${s.peak_dst_nT} nT`
        sel.appendChild(o)
      })
      sel.addEventListener('change', ()=>{
        const s = stormById[sel.value]
        if(!s) return
        jumpToStorm(s)
        loadStormRange(s)
      })
    }

    // ---------- sim update ----------
    function loop(ts){
      if(lastTs === null) lastTs = ts
      const dt = Math.min(0.12, (ts-lastTs)/1000)
      lastTs = ts
      tGlobal += dt

      if(playing){
        simDay += daysPerSecond*dt
        if(simDay >= totalDays-1){ simDay = totalDays-1; playing=false; updatePlayUI() }
        broadcast(ts)
      }
      simDay = Math.max(0, Math.min(totalDays-1, simDay))

      updateStormState(dt)
      updateCMEs(dt)
      updateShockRings(dt)
      render(dt)
      rafId = requestAnimationFrame(loop)
    }

    function updateStormState(){
      const idx = Math.floor(simDay)
      const sid = dayStormId[idx]
      if(sid !== prevStormId){
        if(sid != null){
          spawnCME(dayIntensity[idx])
          showBanner(stormById[sid])
        } else {
          bannerEl.style.display = 'none'
        }
        prevStormId = sid
      }
    }

    function showBanner(storm){
      const icon = storm.intensity === 'severe' ? '⚠⚠' : storm.intensity === 'intense' ? '⚠' : '●'
      const name = namedStormFor(storm)
      bannerEl.innerHTML = `${icon} ${name} — ${storm.intensity} storm, Dst reaching ${storm.peak_dst_nT} nT`
      bannerEl.style.display = 'flex'
    }

    function spawnCME(intensity){
      const sizeFactor = intensity === 'severe' ? 1.5 : intensity === 'intense' ? 1.15 : 0.85
      cmes.push({ progress: 0, angle: earthAngle, intensity, sizeFactor, duration: 1.7 })
      flashAlpha = Math.max(flashAlpha, 0.12)
    }

    function updateCMEs(dt){
      for(let i=cmes.length-1;i>=0;i--){
        const c = cmes[i]
        c.progress += dt / c.duration
        if(c.progress >= 1){
          shockRings.push({ x: earthX, y: earthY, r: 4, alpha: 0.9, maxR: scale*0.16*c.sizeFactor })
          cmes.splice(i,1)
        }
      }
      if(flashAlpha > 0) flashAlpha = Math.max(0, flashAlpha - dt*0.4)
    }

    function updateShockRings(dt){
      for(let i=shockRings.length-1;i>=0;i--){
        const r = shockRings[i]
        r.r += dt * scale * 0.9
        r.alpha -= dt * 0.9
        if(r.alpha <= 0 || r.r > r.maxR*3) shockRings.splice(i,1)
      }
    }

    // ---------- render ----------
    function render(dt){
      ctx.clearRect(0,0,W,H)
      drawStars()

      const idx = Math.floor(simDay)
      stormZoomTarget = dayStormId[idx] != null ? 1.08 : 1.0
      stormZoom += (stormZoomTarget - stormZoom) * Math.min(1, dt*1.5)
      zoom = userZoom * stormZoom

      ctx.save()
      ctx.translate(cx,cy)
      ctx.scale(zoom,zoom)
      ctx.translate(-cx,-cy)

      drawSun()
      if(showOrbits) drawOrbitPaths()
      computePlanetPositions()
      if(showWind) drawWind(dt)
      drawCMEs()
      drawPlanets()
      drawShockRings()
      ctx.restore()

      if(flashAlpha > 0){
        ctx.fillStyle = `rgba(198,95,232,${flashAlpha*0.25})`
        ctx.fillRect(0,0,W,H)
      }
      updateReadouts()
      drawTimeline()
      drawMagMonitor(idx)
    }

    function drawStars(){
      ctx.save()
      stars.forEach(s=>{
        const a = s.baseAlpha * (0.55 + 0.45*Math.sin(tGlobal*s.speed + s.phase))
        ctx.globalAlpha = a
        ctx.fillStyle = '#DCE6FF'
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI*2)
        ctx.fill()
      })
      ctx.restore()
    }

    function drawSun(){
      const r = scale*0.055 * (1 + 0.04*Math.sin(tGlobal*1.6))
      const grad = ctx.createRadialGradient(cx,cy,0, cx,cy,r*3.2)
      grad.addColorStop(0,'rgba(255,214,120,0.9)')
      grad.addColorStop(0.35,'rgba(255,170,60,0.35)')
      grad.addColorStop(1,'rgba(255,170,60,0)')
      ctx.fillStyle = grad
      ctx.beginPath(); ctx.arc(cx,cy,r*3.2,0,Math.PI*2); ctx.fill()

      const coreGrad = ctx.createRadialGradient(cx-r*0.3,cy-r*0.3,0, cx,cy,r)
      coreGrad.addColorStop(0,'#FFF3D6')
      coreGrad.addColorStop(0.6,'#FFC24D')
      coreGrad.addColorStop(1,'#F08A1F')
      ctx.fillStyle = coreGrad
      ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill()

      ctx.save()
      ctx.globalAlpha = 0.25
      ctx.strokeStyle = '#FFD98A'
      for(let i=0;i<2;i++){
        ctx.beginPath()
        ctx.arc(cx,cy, r*1.4 + i*4, tGlobal*0.3 + i, tGlobal*0.3 + i + 2.4)
        ctx.lineWidth = 1
        ctx.stroke()
      }
      ctx.restore()
    }

    function orbitRadius(pf){ return pf*scale*1.55 }

    function drawOrbitPaths(){
      ctx.save()
      ctx.strokeStyle = C_HAIR
      ctx.setLineDash([2,4])
      ctx.lineWidth = 1
      PLANETS.forEach(p=>{
        ctx.beginPath()
        ctx.arc(cx,cy, orbitRadius(p.radiusFactor), 0, Math.PI*2)
        ctx.stroke()
      })
      // faint asteroid belt
      ctx.globalAlpha = 0.4
      ctx.beginPath()
      ctx.arc(cx,cy, orbitRadius(0.46), 0, Math.PI*2)
      ctx.stroke()
      ctx.restore()
    }

    let planetPos = []
    function computePlanetPositions(){
      planetPos = PLANETS.map(p=>{
        const angle = (simDay / p.period) * Math.PI*2
        const r = orbitRadius(p.radiusFactor)
        const x = cx + Math.cos(angle)*r
        const y = cy + Math.sin(angle)*r
        if(p.isEarth){ earthAngle = angle; earthX = x; earthY = y; earthOrbitR = r }
        return { ...p, angle, x, y, r }
      })
    }

    function drawPlanets(){
      const idx = Math.floor(simDay)
      const activeStorm = dayStormId[idx] != null ? stormById[dayStormId[idx]] : null
      const row = daily[idx] || {}
      const kpAuroraOnly = !activeStorm && row.Kp != null && row.Kp >= 6

      planetPos.forEach(p=>{
        if(p.isEarth && activeStorm){
          drawMagnetosphere(p, activeStorm.intensity, row.Dst)
        } else if(p.isEarth && kpAuroraOnly){
          drawAuroraOnly(p)
        }
        ctx.beginPath()
        ctx.fillStyle = p.color
        ctx.shadowColor = p.color
        ctx.shadowBlur = p.isEarth ? 10 : 4
        ctx.arc(p.x, p.y, p.size, 0, Math.PI*2)
        ctx.fill()
        ctx.shadowBlur = 0

        if(showLabels){
          ctx.font = '9px ' + "'JetBrains Mono', monospace"
          ctx.fillStyle = C_TEXTFAINT
          ctx.textAlign = 'center'
          ctx.fillText(p.name.toUpperCase(), p.x, p.y - p.size - 6)
        }
      })
    }

    function drawMagnetosphere(p, intensity, dstVal){
      const compress = intensity === 'severe' ? 0.38 : intensity === 'intense' ? 0.58 : 0.8
      const stretch = intensity === 'severe' ? 4.6 : intensity === 'intense' ? 3.2 : 2.1
      const baseR = p.size * 3.4 * compress
      const sunDir = Math.atan2(cy-p.y, cx-p.x)
      const nightDir = sunDir + Math.PI

      // compressed bow shock, sun-facing side — pushed in hard during storms
      ctx.save()
      ctx.strokeStyle = C_AURORA
      ctx.globalAlpha = 0.6 + 0.3*Math.sin(tGlobal*4)
      ctx.setLineDash([2,3])
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.arc(p.x, p.y, baseR, sunDir - 1.1, sunDir + 1.1)
      ctx.stroke()
      ctx.restore()

      // stretched magnetotail on the night side — the classic "solar wind
      // crushes the day side, drags out the night side" shape
      ctx.save()
      ctx.strokeStyle = C_AURORA
      ctx.globalAlpha = 0.35
      ctx.lineWidth = 1.2
      ctx.setLineDash([1,3])
      const tailLen = p.size * stretch
      const tailWidth = p.size * 1.6
      for(const side of [-1,1]){
        ctx.beginPath()
        ctx.moveTo(p.x + Math.cos(sunDir - side*0.9)*p.size*1.2, p.y + Math.sin(sunDir - side*0.9)*p.size*1.2)
        ctx.quadraticCurveTo(
          p.x + Math.cos(nightDir)*tailLen*0.6 + Math.cos(nightDir+side*1.5708)*tailWidth,
          p.y + Math.sin(nightDir)*tailLen*0.6 + Math.sin(nightDir+side*1.5708)*tailWidth,
          p.x + Math.cos(nightDir)*tailLen,
          p.y + Math.sin(nightDir)*tailLen
        )
        ctx.stroke()
      }
      ctx.restore()

      // pole glow (aurora)
      const glowR = p.size * 2.8
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR)
      grad.addColorStop(0, 'rgba(92,242,160,0.4)')
      grad.addColorStop(1, 'rgba(92,242,160,0)')
      ctx.fillStyle = grad
      ctx.beginPath(); ctx.arc(p.x, p.y, glowR, 0, Math.PI*2); ctx.fill()

      if(showLabels && dstVal != null){
        ctx.font = '9px ' + "'JetBrains Mono', monospace"
        ctx.fillStyle = C_DANGER
        ctx.textAlign = 'center'
        ctx.fillText(`Dst ${dstVal.toFixed(0)} nT`, p.x, p.y + p.size + 14)
      }
    }

    function drawAuroraOnly(p){
      const glowR = p.size * 2.2
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR)
      grad.addColorStop(0, 'rgba(92,242,160,0.22)')
      grad.addColorStop(1, 'rgba(92,242,160,0)')
      ctx.fillStyle = grad
      ctx.beginPath(); ctx.arc(p.x, p.y, glowR, 0, Math.PI*2); ctx.fill()
    }

    // ---------- magnetosphere monitor (always-visible close-up inset) ----------
    // Shows Earth's field getting shoved around in real time — compressed bow
    // shock + stretched tail during storms — so the storm's effect reads at a
    // glance instead of living only in the Dst number in the readout.
    function magWindArrows(row){
      const v = row.v ?? 400, n = row.n ?? 5, bz = row.Bz ?? 0
      return {
        speed: Math.min(2.4, Math.max(0.5, v/380)),
        count: Math.min(5, Math.max(2, Math.round(n/3) + 2)),
        col: bz < 0 ? C_DANGER : C_CALM
      }
    }

    function drawMagMonitor(idx){
      if(!magCtx) return
      magCtx.clearRect(0,0,MAG_W,MAG_H)

      const row = daily[idx] || {}
      const activeStorm = dayStormId[idx] != null ? stormById[dayStormId[idx]] : null
      const auroraOnly = !activeStorm && row.Kp != null && row.Kp >= 6

      let compress, stretch, pulseSpeed, col, label
      if(activeStorm){
        const it = activeStorm.intensity
        compress   = it === 'severe' ? 0.32 : it === 'intense' ? 0.52 : 0.76
        stretch    = it === 'severe' ? 3.8  : it === 'intense' ? 2.7  : 1.7
        pulseSpeed = it === 'severe' ? 7    : it === 'intense' ? 5   : 3.5
        col   = it === 'severe' ? C_DANGER : it === 'intense' ? C_SLOW : C_AURORA
        label = it === 'severe' ? 'SEVERE STORM' : it === 'intense' ? 'INTENSE STORM' : 'MINOR STORM'
      } else if(auroraOnly){
        compress = 0.9; stretch = 1.3; pulseSpeed = 2.4; col = C_AURORA; label = 'AURORA ACTIVE'
      } else {
        compress = 1.0; stretch = 1.0; pulseSpeed = 1.1; col = C_CALM; label = 'CALM'
      }

      const ex = MAG_W*0.62, ey = MAG_H*0.54
      const earthR = 6
      const baseR = 22 * compress
      const wind = magWindArrows(row)

      // solar wind streaming in from the sun (left) toward Earth
      magCtx.save()
      magCtx.strokeStyle = wind.col
      magCtx.lineWidth = 1.3
      const travelDist = Math.max(20, (ex - baseR) - 10)
      for(let lane=0; lane<wind.count; lane++){
        const laneY = 12 + lane * ((MAG_H-20) / Math.max(1,wind.count-1))
        const phase = (tGlobal*40*wind.speed + lane*17) % travelDist
        const x = 6 + phase
        magCtx.globalAlpha = 0.55
        magCtx.beginPath()
        magCtx.moveTo(x-6, laneY-4)
        magCtx.lineTo(x, laneY)
        magCtx.lineTo(x-6, laneY+4)
        magCtx.stroke()
      }
      magCtx.restore()

      // magnetotail, night side — stretches away from the sun during storms
      magCtx.save()
      magCtx.strokeStyle = col
      magCtx.globalAlpha = 0.4
      magCtx.lineWidth = 1.3
      const tailLen = earthR * 3.2 * stretch
      const tailW = earthR * 1.5
      for(const side of [-1,1]){
        magCtx.beginPath()
        magCtx.moveTo(ex + earthR*0.5, ey + side*earthR*1.1)
        magCtx.quadraticCurveTo(ex + tailLen*0.55, ey + side*tailW, ex + tailLen, ey + side*tailW*0.5)
        magCtx.stroke()
      }
      magCtx.restore()

      // bow shock, day side — pushed in hard and pulsing during storms
      magCtx.save()
      magCtx.strokeStyle = col
      magCtx.globalAlpha = 0.65 + 0.3*Math.sin(tGlobal*pulseSpeed)
      magCtx.lineWidth = 1.6;
      [0, 6].forEach(offset=>{
        magCtx.beginPath()
        magCtx.arc(ex, ey, baseR + offset, Math.PI*0.62, Math.PI*1.38)
        magCtx.stroke()
      })
      magCtx.restore()

      // pole glow / aurora
      const glowR = earthR * (activeStorm ? 3.4 : auroraOnly ? 2.6 : 1.9)
      const grad = magCtx.createRadialGradient(ex,ey,0, ex,ey,glowR)
      grad.addColorStop(0, col + '55')
      grad.addColorStop(1, col + '00')
      magCtx.fillStyle = grad
      magCtx.beginPath(); magCtx.arc(ex,ey,glowR,0,Math.PI*2); magCtx.fill()

      // earth
      magCtx.beginPath()
      magCtx.fillStyle = '#4F8CFF'
      magCtx.shadowColor = '#4F8CFF'
      magCtx.shadowBlur = 6
      magCtx.arc(ex, ey, earthR, 0, Math.PI*2)
      magCtx.fill()
      magCtx.shadowBlur = 0

      if(magStatusEl){
        let statusText = label
        if(activeStorm && row.Dst != null) statusText += ' · ' + row.Dst.toFixed(0) + ' nT'
        magStatusEl.textContent = statusText
        magStatusEl.style.color = col
        magStatusEl.classList.toggle('pulse', !!activeStorm && activeStorm.intensity !== 'moderate')
      }
    }

    function drawWind(dt){
      const idx = Math.floor(simDay)
      const row = daily[idx] || {}
      const v = row.v ?? 400, n = row.n ?? 5, bz = row.Bz ?? 0
      const sunR = scale*0.055
      const maxR = scale*0.5
      const speedScale = (scale*0.16) * (v/420)
      const nNorm = Math.min(1, Math.max(0.15, n/25))
      const col = bz < 0 ? C_DANGER : C_CALM

      ctx.save()
      windParticles.forEach(wp=>{
        wp.r += speedScale * wp.speedFactor * dt
        if(wp.r > maxR){ wp.r = sunR + Math.random()*8; wp.angle = Math.random()*Math.PI*2 }
        const x = cx + Math.cos(wp.angle)*wp.r
        const y = cy + Math.sin(wp.angle)*wp.r
        ctx.globalAlpha = nNorm * 0.7
        ctx.fillStyle = col
        ctx.beginPath()
        ctx.arc(x,y,1.15,0,Math.PI*2)
        ctx.fill()
      })
      ctx.restore()
    }

    function drawCMEs(){
      cmes.forEach(c=>{
        const dist = c.progress * earthOrbitR
        const x = cx + Math.cos(c.angle)*dist
        const y = cy + Math.sin(c.angle)*dist
        const r = (6 + c.progress*16) * c.sizeFactor

        // expanding wavefront: 3 concentric arcs sweeping outward from the
        // Sun in a cone toward Earth — reads as ")))" rather than a blob.
        ctx.save()
        const coneHalfAngle = 0.42
        for(let k=0;k<3;k++){
          const wp = Math.max(0, c.progress - k*0.09)
          if(wp <= 0) continue
          const wr = wp * earthOrbitR
          ctx.globalAlpha = (0.85 - k*0.25) * c.sizeFactor
          ctx.strokeStyle = C_CME
          ctx.lineWidth = 2.2 - k*0.5
          ctx.beginPath()
          ctx.arc(cx, cy, wr, c.angle - coneHalfAngle, c.angle + coneHalfAngle)
          ctx.stroke()
        }
        ctx.restore()

        // bright glowing head at the leading edge
        const grad = ctx.createRadialGradient(x,y,0,x,y,r)
        grad.addColorStop(0,'rgba(230,170,255,0.95)')
        grad.addColorStop(0.5,'rgba(198,95,232,0.55)')
        grad.addColorStop(1,'rgba(198,95,232,0)')
        ctx.fillStyle = grad
        ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill()
      })
    }

    function drawShockRings(){
      shockRings.forEach(r=>{
        ctx.save()
        ctx.globalAlpha = Math.max(0, r.alpha)
        ctx.strokeStyle = C_AURORA
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.arc(r.x, r.y, r.r, 0, Math.PI*2)
        ctx.stroke()
        ctx.restore()
      })
    }

    // ---------- readouts ----------
    function updateReadouts(){
      const idx = Math.floor(simDay)
      const row = daily[idx] || {}
      dateReadout.innerHTML = `${fmtDate(idx)} <span class="v5-day-of">day ${idx+1} / ${totalDays}</span>`

      const badge = $('v5-regime-badge')
      const regime = row.regime || 'unknown'
      badge.className = 'v5-regime-badge v5-regime-' + regime
      badge.textContent = ({slow:'Slow stream', fast:'Fast stream', cme:'CME ejecta', unknown:'Unclassified'})[regime] || regime

      setMetric('v5-m-v', row.v!=null ? row.v.toFixed(0)+' km/s' : '—')
      setMetric('v5-m-n', row.n!=null ? row.n.toFixed(1)+' /cc' : '—')
      setMetric('v5-m-b', row.B!=null ? row.B.toFixed(1)+' nT' : '—')
      setMetric('v5-m-bz', row.Bz!=null ? row.Bz.toFixed(1)+' nT' : '—', row.Bz!=null ? (row.Bz < -5 ? 'bad' : row.Bz < 0 ? 'warn' : 'ok') : '')
      setMetric('v5-m-kp', row.Kp!=null ? row.Kp : '—', row.Kp!=null ? (row.Kp >= 6 ? 'bad' : row.Kp >= 4 ? 'warn' : 'ok') : '')
      setMetric('v5-m-dst', row.Dst!=null ? row.Dst.toFixed(0)+' nT' : '—', row.Dst!=null ? (row.Dst <= -200 ? 'bad flash' : row.Dst <= -100 ? 'bad' : row.Dst <= -50 ? 'warn' : 'ok') : '')
    }

    function setMetric(id, text, cls){
      const el = $(id)
      el.textContent = text
      el.className = cls || ''
    }

    // ---------- timeline ----------
    function drawTimeline(){
      const rect = tlCanvas.getBoundingClientRect()
      const w = rect.width, h = 52
      tlCtx.clearRect(0,0,w,h)
      const pad = 8
      const xScale = d => pad + (d/(totalDays-1)) * (w-2*pad)

      // dashboard range + brushed selection, as indigo bands
      const link = linkRef.current
      if(link.start && link.end){
        const i0 = Math.max(0, dayIndexFromISO(link.start + 'T00:00:00Z'))
        const i1 = Math.min(totalDays-1, dayIndexFromISO(link.end + 'T00:00:00Z'))
        if(Number.isFinite(i0) && Number.isFinite(i1) && i1 >= i0){
          const x0 = xScale(i0), x1 = xScale(i1)
          tlCtx.fillStyle = 'rgba(99,102,241,0.15)'
          tlCtx.fillRect(x0, 5, Math.max(2, x1-x0), 36)
          tlCtx.strokeStyle = 'rgba(99,102,241,0.8)'
          tlCtx.lineWidth = 1
          tlCtx.strokeRect(x0, 5, Math.max(2, x1-x0), 36)
        }
      }
      if(link.selection){
        const s0 = dayIndexFromLocal(link.selection[0])
        const s1 = dayIndexFromLocal(link.selection[1])
        if(Number.isFinite(s0) && Number.isFinite(s1) && s1 >= s0){
          tlCtx.fillStyle = 'rgba(99,102,241,0.35)'
          tlCtx.fillRect(xScale(Math.max(0,s0)), 5, Math.max(2, xScale(Math.min(totalDays-1,s1)) - xScale(Math.max(0,s0))), 36)
        }
      }

      // baseline
      tlCtx.strokeStyle = C_HAIR
      tlCtx.lineWidth = 1
      tlCtx.beginPath()
      tlCtx.moveTo(pad, 34); tlCtx.lineTo(w-pad, 34); tlCtx.stroke()

      // year ticks
      tlCtx.font = '9px JetBrains Mono, monospace'
      tlCtx.fillStyle = C_TEXTFAINT
      tlCtx.textAlign = 'center'
      for(let y=1995;y<=2025;y+=5){
        const d = dayIndexFromISO(`${y}-01-01T00:00:00Z`)
        if(d<0||d>=totalDays) continue
        const x = xScale(d)
        tlCtx.beginPath(); tlCtx.moveTo(x,30); tlCtx.lineTo(x,38); tlCtx.strokeStyle=C_HAIR; tlCtx.stroke()
        tlCtx.fillText(String(y), x, 48)
      }

      // storm period bands (start -> end), faint, under the ticks
      storms.forEach(s=>{
        const d0 = xScale(Math.max(0, dayIndexFromISO(s.start)))
        const d1 = xScale(Math.min(totalDays-1, dayIndexFromISO(s.end)))
        const col = s.intensity==='severe' ? C_DANGER : s.intensity==='intense' ? C_SLOW : C_TEXTFAINT
        tlCtx.globalAlpha = s.intensity==='severe' ? 0.5 : s.intensity==='intense' ? 0.32 : 0.16
        tlCtx.fillStyle = col
        tlCtx.fillRect(d0, 16, Math.max(1, d1-d0), 18)
        tlCtx.globalAlpha = 1
      })

      // storm ticks
      storms.forEach(s=>{
        const d = dayIndexFromISO(s.peak_time)
        const x = xScale(d)
        const hgt = s.intensity==='severe' ? 16 : s.intensity==='intense' ? 11 : 6
        const col = s.intensity==='severe' ? C_DANGER : s.intensity==='intense' ? C_SLOW : C_TEXTFAINT
        tlCtx.strokeStyle = col
        tlCtx.globalAlpha = s.intensity==='severe' ? 0.95 : s.intensity==='intense' ? 0.7 : 0.4
        tlCtx.lineWidth = s.intensity==='severe' ? 1.6 : 1
        tlCtx.beginPath()
        tlCtx.moveTo(x, 34); tlCtx.lineTo(x, 34-hgt)
        tlCtx.stroke()
        tlCtx.globalAlpha = 1
      })

      // playhead
      const px = xScale(simDay)
      tlCtx.strokeStyle = C_FAST
      tlCtx.lineWidth = 1.4
      tlCtx.beginPath(); tlCtx.moveTo(px, 6); tlCtx.lineTo(px, 40); tlCtx.stroke()
      tlCtx.fillStyle = C_FAST
      tlCtx.beginPath()
      tlCtx.moveTo(px-4, 6); tlCtx.lineTo(px+4, 6); tlCtx.lineTo(px, 12); tlCtx.closePath()
      tlCtx.fill()
    }

    return () => {
      disposed = true
      apiRef.current = null
      ac.abort()
      cancelAnimationFrame(rafId)
      if(resizeObserver) resizeObserver.disconnect()
      window.removeEventListener('mousemove', onWindowMouseMove)
      window.removeEventListener('mouseup', onWindowMouseUp)
    }
  }, [])

  // Paused sim follows the shared cursor from V1/V2/V3
  useEffect(() => { apiRef.current?.onExternalHover(hoverTime) }, [hoverTime])
  // New dashboard range parks the playhead at its start
  useEffect(() => { apiRef.current?.onRangeChange() }, [start, end])

  return (
    <div ref={rootRef} className="h-full flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="flex-none flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-900/60">
        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-indigo-400 tracking-wider">V5</span>
        <span className="text-sm font-semibold text-slate-200">Orbital Storm Simulator</span>
        <span className="hidden xl:block text-[10px] text-slate-500">
          · play syncs cursors · pause follows hover · storm jump loads all panels
        </span>
        <span id="v5-count" className="hidden sm:block text-[10px] font-mono text-slate-500 ml-auto">loading…</span>
      </div>

      <style>{V5_CSS}</style>

      <div id="v5-root">
        <div className="v5-main">
          <div className="v5-canvas-wrap" id="v5-canvas-wrap">
            <canvas id="v5-canvas" />
            <div className="v5-scanline" />
            <div className="v5-storm-banner" id="v5-storm-banner" />
            <div className="v5-mag-monitor" id="v5-mag-monitor">
              <div className="v5-mag-monitor-title">Magnetosphere</div>
              <canvas id="v5-mag-canvas" />
              <div className="v5-mag-status" id="v5-mag-status">—</div>
            </div>

            <div className="v5-readout">
              <span id="v5-regime-badge" className="v5-regime-badge v5-regime-unknown">—</span>
              <span className="v5-ro">v <b id="v5-m-v">—</b></span>
              <span className="v5-ro">n <b id="v5-m-n">—</b></span>
              <span className="v5-ro">|B| <b id="v5-m-b">—</b></span>
              <span className="v5-ro">Bz <b id="v5-m-bz">—</b></span>
              <span className="v5-ro">Kp <b id="v5-m-kp">—</b></span>
              <span className="v5-ro">Dst <b id="v5-m-dst">—</b></span>
            </div>

            <div className="v5-legend-overlay">
              <div className="v5-legend-row"><div className="v5-legend-dot" style={{ background: 'var(--calm)' }} />wind · Bz ≥ 0</div>
              <div className="v5-legend-row"><div className="v5-legend-dot" style={{ background: 'var(--danger)' }} />wind · Bz &lt; 0</div>
              <div className="v5-legend-row"><div className="v5-legend-dot" style={{ background: 'var(--cme)' }} />CME ejecta</div>
              <div className="v5-legend-row"><div className="v5-legend-dot" style={{ background: 'var(--aurora)' }} />aurora / compression</div>
            </div>

            <div className="v5-loading" id="v5-loading">loading orbital data…</div>
            <div className="v5-tooltip" id="v5-tooltip" />
          </div>

          <div className="v5-timeline-block">
            <div className="v5-timeline-top">
              <div className="v5-date-readout" id="v5-date-readout">— <span className="v5-day-of">day 0 / 0</span></div>
              <div className="v5-sub" id="v5-storm-count-sub" />
            </div>
            <canvas id="v5-timeline" />
            <div className="v5-controls">
              <button className="v5-btn" id="v5-play">▶ PLAY</button>
              <button className="v5-btn" id="v5-prev-storm">◀ STORM</button>
              <button className="v5-btn" id="v5-next-storm">STORM ▶</button>
              <select className="v5-btn" id="v5-speed" defaultValue="5">
                <option value="1">1×</option>
                <option value="5">5×</option>
                <option value="20">20×</option>
                <option value="100">100×</option>
              </select>
              <select className="v5-btn" id="v5-storm-select" defaultValue="">
                <option value="">⚠ JUMP TO STORM → ALL PANELS</option>
              </select>
              <button className="v5-btn" id="v5-zoom-out">－</button>
              <button className="v5-btn" id="v5-zoom-in">＋</button>
              <div className="v5-toggles">
                <label><input type="checkbox" id="v5-toggle-wind" defaultChecked /> wind</label>
                <label><input type="checkbox" id="v5-toggle-orbits" defaultChecked /> orbits</label>
                <label><input type="checkbox" id="v5-toggle-labels" defaultChecked /> labels</label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
