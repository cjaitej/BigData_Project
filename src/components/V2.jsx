import { useRef, useEffect, useState } from 'react'
import * as d3 from 'd3'

const MARGIN = {
  top: 20,
  right: 30,
  bottom: 55,
  left: 65,
}

export default function V2({ data, hoverTime, setHoverTime, selection }) {

  const wrapRef = useRef(null)
  const svgRef = useRef(null)
  const stateRef = useRef(null)   // scales + hover elements for the linked-view effects

  // Redraw when the grid cell resizes — chart height follows the container
  const [sizeTick, setSizeTick] = useState(0)
  useEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver(() => setSizeTick(t => t + 1))
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {

    if (!data?.length || !wrapRef.current) return

    const totalWidth = wrapRef.current.clientWidth
    const totalHeight = wrapRef.current.clientHeight || 450

    const width =
      totalWidth - MARGIN.left - MARGIN.right

    const height =
      totalHeight - MARGIN.top - MARGIN.bottom

    const svg = d3.select(svgRef.current)

    svg.selectAll("*").remove()
    d3.select(wrapRef.current)

    .selectAll("div")

    .remove()

    svg
      .attr("width", totalWidth)
      .attr("height", totalHeight)

    //--------------------------------------------------
    // Clip Path
    //--------------------------------------------------

    const defs = svg.append("defs")

    defs.append("clipPath")

        .attr("id","scatterClip")

        .append("rect")

        .attr("width",width)

        .attr("height",height)

        const plot = svg.append("g")

        .attr(
            "transform",
            `translate(${MARGIN.left},${MARGIN.top})`
    )

    const gridGroup = plot.append("g")

    const axisGroup = plot.append("g")

    const pointsGroup = plot.append("g")
    .attr("clip-path","url(#scatterClip)")

    // Ring highlighting the point at the shared hover time (above the points)
    const ringGroup = plot.append("g")
    .attr("clip-path","url(#scatterClip)")

    const ring = ringGroup.append("circle")

        .attr("r", 8)

        .attr("fill", "none")

        .attr("stroke", "#E7EAF0")

        .attr("stroke-width", 2)

        .style("display", "none")

        .style("pointer-events", "none")

    //--------------------------------------------------
    // Data
    //--------------------------------------------------

    const parsed = data.filter(d =>

      d.flow_speed_kms != null &&
      d.proton_density_ncc != null

    ).map(d => ({ ...d, t: new Date(d.datetime) }))

    //--------------------------------------------------
    // Scales
    //--------------------------------------------------

    const x = d3.scaleLinear()

      .domain(d3.extent(parsed,
        d => d.flow_speed_kms))

      .nice()

      .range([0, width])



    const y = d3.scaleLinear()

      .domain(d3.extent(parsed,
        d => d.proton_density_ncc))

      .nice()

      .range([height, 0])

    //--------------------------------------------------
    // Grid
    //--------------------------------------------------

    gridGroup.append("g")

      .call(

        d3.axisLeft(y)

          .tickSize(-width)

          .tickFormat("")

      )

      .call(g => g.select(".domain").remove())

      .call(g =>

        g.selectAll(".tick line")

          .attr("stroke", "#1E2330")

      )



    gridGroup.append("g")

      .attr(

        "transform",

        `translate(0,${height})`

      )

      .call(

        d3.axisBottom(x)

          .tickSize(-height)

          .tickFormat("")

      )

      .call(g => g.select(".domain").remove())

      .call(g =>

        g.selectAll(".tick line")

          .attr("stroke", "#1E2330")

      )

    //--------------------------------------------------
    // Axes
    //--------------------------------------------------

    const xAxis = axisGroup
    
    .append("g")

      .attr(

        "transform",

        `translate(0,${height})`

      )

      .call(d3.axisBottom(x).ticks(6))

      .call(g =>

        g.selectAll("text")

          .attr("fill", "#7C8496")

      )

      .call(g =>

        g.selectAll("line,path")

          .attr("stroke", "#252B3A")

      )



    const yAxis = axisGroup
    .append("g")

      .call(d3.axisLeft(y).ticks(6))

      .call(g =>

        g.selectAll("text")

          .attr("fill", "#7C8496")

      )

      .call(g =>

        g.selectAll("line,path")

          .attr("stroke", "#252B3A")

      )

//--------------------------------------------------
// Color Scale (IMF Bz)
//--------------------------------------------------

const bzExtent = d3.extent(parsed, d => d.bz_gsm_nT)

const maxAbs = Math.max(

  Math.abs(bzExtent[0] || 0),

  Math.abs(bzExtent[1] || 0)

)

const color = d3.scaleSequential()

  .domain([maxAbs, -maxAbs])

  .interpolator(d3.interpolateRdBu)


//--------------------------------------------------
// Tooltip
//--------------------------------------------------

const tooltip = d3

  .select(wrapRef.current)

  .append("div")

  .style("position", "absolute")

  .style("pointer-events", "none")

  .style("background", "#0f172a")

  .style("border", "1px solid #252B3A")

  .style("border-radius", "6px")

  .style("padding", "8px")

  .style("font-size", "11px")

  .style("color", "#e2e8f0")

  .style("opacity", 0)


//--------------------------------------------------
// Scatter
//--------------------------------------------------

pointsGroup

.selectAll("circle")

.data(parsed)

.enter()

.append("circle")

.attr("cx", d=>x(d.flow_speed_kms))

.attr("cy", d=>y(d.proton_density_ncc))

.attr("r",4)

.attr("fill", d=>color(d.bz_gsm_nT))

.attr("opacity",0.8)

.on("mouseover", function(event,d){

    setHoverTime(d.t)

    d3.select(this)

        .transition()

        .duration(100)

        .attr("r",7)

        .attr("stroke","#ffffff")

        .attr("stroke-width",1.5)

    tooltip

        .style("opacity",1)

        .html(`

<b>${new Date(d.datetime).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</b>

<hr style="border-color:#252B3A">

Speed : ${d.flow_speed_kms.toFixed(1)} km/s<br>

Density : ${d.proton_density_ncc.toFixed(2)} n/cc<br>

Bz : ${d.bz_gsm_nT.toFixed(2)} nT<br>

Kp : ${d.kp}

`)

})

.on("mousemove", function(event){

    // Clamp so the tooltip never gets cut off by the panel's own
    // overflow-hidden — flip to the other side of the cursor instead.
    const wrapEl = wrapRef.current
    const node = tooltip.node()
    const tw = node.offsetWidth, th = node.offsetHeight
    let left = event.offsetX + 15
    let top = event.offsetY - th - 12
    if (left + tw > wrapEl.clientWidth) left = event.offsetX - tw - 15
    if (left < 4) left = 4
    if (top < 4) top = event.offsetY + 15
    if (top + th > wrapEl.clientHeight) top = wrapEl.clientHeight - th - 4

    tooltip

        .style("left", `${left}px`)

        .style("top", `${top}px`)

})

.on("mouseout", function(){

    setHoverTime(null)

    d3.select(this)

        .transition()

        .duration(100)

        .attr("r",4)

        .attr("stroke","none")

    tooltip

        .style("opacity",0)

})

    //--------------------------------------------------
    // Labels
    //--------------------------------------------------

    svg.append("text")

      .attr(

        "x",

        totalWidth / 2

      )

      .attr(

        "y",

        totalHeight - 10

      )

      .attr(

        "text-anchor",

        "middle"

      )

      .attr("fill", "#7C8496")

      .attr("font-size", 11)

      .text("Solar Wind Speed (km/s)")



    svg.append("text")

      .attr(

        "transform",

        "rotate(-90)"

      )

      .attr(

        "x",

        -totalHeight / 2

      )

      .attr(

        "y",

        18

      )

      .attr(

        "text-anchor",

        "middle"

      )

      .attr("fill", "#7C8496")

      .attr("font-size", 11)

      .text("Proton Density (n/cc)")
  

  //--------------------------------------------------
  // Zoom
  //--------------------------------------------------

  const zoom = d3.zoom()

  .scaleExtent([1,10])

  .translateExtent([[0,0],[width,height]])
  .extent([

    [0,0],

    [width,height]

])

  .on("zoom",(event)=>{

    const transform = event.transform

    const zx = transform.rescaleX(x)

    const zy = transform.rescaleY(y)

    // re-apply the dim styling — a bare .call() would reset to d3's defaults
    xAxis.call(d3.axisBottom(zx).ticks(6))
        .call(g => g.selectAll("text").attr("fill", "#7C8496"))
        .call(g => g.selectAll("line,path").attr("stroke", "#252B3A"))

    yAxis.call(d3.axisLeft(zy).ticks(6))
        .call(g => g.selectAll("text").attr("fill", "#7C8496"))
        .call(g => g.selectAll("line,path").attr("stroke", "#252B3A"))

    pointsGroup

        .selectAll("circle")

        .attr("cx",d=>zx(d.flow_speed_kms))

        .attr("cy",d=>zy(d.proton_density_ncc))
    // pointsGroup.raise();

    // Keep the linked-hover ring glued to its point while zooming
    const s = stateRef.current

    if (s) {

        s.zx = zx
        s.zy = zy

        if (s.lastPoint) {

            ring
                .attr("cx", zx(s.lastPoint.flow_speed_kms))
                .attr("cy", zy(s.lastPoint.proton_density_ncc))

        }

    }

})

  svg.call(zoom)

  stateRef.current = {

      parsed,

      zx: x,

      zy: y,

      ring,

      pointsGroup,

      bisect: d3.bisector(d => d.t).center,

      lastPoint: null,

  }

  }, [data, sizeTick, setHoverTime])

  //--------------------------------------------------
  // Linked hover — ring the point nearest the
  // shared hover time (set here, in V1 or in V3)
  //--------------------------------------------------

  useEffect(() => {

    const s = stateRef.current
    if (!s) return

    if (!hoverTime || !s.parsed.length) {

        s.lastPoint = null

        s.ring.style("display", "none")

        return
    }

    const p = s.parsed[s.bisect(s.parsed, hoverTime)]
    if (!p) return

    s.lastPoint = p

    s.ring

        .style("display", null)

        .attr("cx", s.zx(p.flow_speed_kms))

        .attr("cy", s.zy(p.proton_density_ncc))

  }, [hoverTime, data])

  //--------------------------------------------------
  // Linked selection — dim points outside the
  // range brushed in V1
  //--------------------------------------------------

  useEffect(() => {

    const s = stateRef.current
    if (!s) return

    if (!selection) {

        s.pointsGroup.selectAll("circle").attr("opacity", 0.8)

        return
    }

    const [t0, t1] = selection

    s.pointsGroup.selectAll("circle")

        .attr("opacity", d => (d.t >= t0 && d.t <= t1) ? 0.9 : 0.05)

  }, [selection, data])

  return (

    <div className="h-full flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">

      <div className="flex-none flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-900/60">

        <span className="text-sm font-semibold text-slate-200" title="Speed vs density, colored by IMF Bz · scroll to zoom · hover syncs all panels">

          Phase Space

        </span>

      </div>

      <div

        ref={wrapRef}

        className="relative w-full flex-1 min-h-0 overflow-hidden"

      >

        {

          !data?.length ?

          <div className="flex items-center justify-center h-full text-slate-500">

            Waiting for data...

          </div>

          :

          <svg

            ref={svgRef}

            style={{ display: "block" }}

          />

        }

      </div>

    </div>

  )

}