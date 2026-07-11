import { useMemo, useState, useEffect, useRef } from "react";
import * as d3 from "d3";

function getSeries(storm, parameter) {

    if (!storm) return [];

    const key = {

        pressure: "pdyn_computed_nPa",

        bz: "bz_gsm_nT",

        sym: "sym_h_nT"

    }[parameter];

    return storm.samples.map((d, i) => ({

        x: i,

        y: Number(d[key])

    }));

}


function findFirstStorm(data) {
  
  if (!data?.length) return null;
  
  const startIndex = data.findIndex((row, i) =>
    row.storm_flag === 1 &&
    (i === 0 || data[i - 1].storm_flag === 0)
  );

  if (startIndex === -1)
    return null;

  const samples = data.slice(startIndex, startIndex + 72);
  // console.log(samples[0])

//   const pressures = samples.map(d => Number(d.pdyn_computed_nPa));

// console.log("Pressures:", pressures);

// const peakPressure = Math.max(...pressures);

// console.log("Peak:", peakPressure);
  return {
  startIndex,

  samples,

  startTime: samples[0].datetime,

  endTime: samples[samples.length - 1].datetime,

  peakPressure: Math.max(
    ...samples.map(d => Number(d.pdyn_computed_nPa))
  ),

  minBz: Math.min(
    ...samples.map(d => Number(d.bz_gsm_nT))
  ),

  minSymH: Math.min(
    ...samples.map(d => Number(d.sym_h_nT))
  )
};

}
export default function V4({ data }) {
  const currentStorm = useMemo(
  () => findFirstStorm(data),
  [data]
);
const [parameter, setParameter] = useState("pressure");
const svgRef = useRef(null);
const wrapRef = useRef(null);
const [referenceStorm, setReferenceStorm] = useState(null);

// Redraw when the grid cell resizes — the chart tracks its real container
// size instead of stretching a fixed viewBox (which distorted axis text
// once this panel started living in a narrow column).
const [sizeTick, setSizeTick] = useState(0);
useEffect(() => {
  if (!wrapRef.current) return;
  const ro = new ResizeObserver(() => setSizeTick(t => t + 1));
  ro.observe(wrapRef.current);
  return () => ro.disconnect();
}, []);

useEffect(() => {

    if (!currentStorm || !wrapRef.current) return;

    const svg = d3.select(svgRef.current);

    svg.selectAll("*").remove();

    const width = wrapRef.current.clientWidth || 700;
    const height = wrapRef.current.clientHeight || 180;
    svg.attr("width", width).attr("height", height);

    const margin = {
        top: 10,
        right: 10,
        bottom: 35,
        left: 45
    };

    const key = {
        pressure: "pdyn_computed_nPa",
        bz: "bz_gsm_nT",
        sym: "sym_h_nT"
    }[parameter];

    const color = {
        pressure: "#facc15",
        bz: "#ef4444",
        sym: "#38bdf8"
    }[parameter];
const plotData = currentStorm.samples.map((d, i) => {

    const raw = d[key];

    let value = null;

    if (
        raw !== null &&
        raw !== undefined &&
        raw !== "" &&
        !Number.isNaN(Number(raw))
    ) {
        value = Number(raw);
    }

    return {
        hour: i,
        value
    };

});

const referencePlotData = referenceStorm
    ? referenceStorm.samples.map((d, i) => {

        const raw = d[key];

        let value = null;

        if (
            raw !== null &&
            raw !== undefined &&
            raw !== "" &&
            !Number.isNaN(Number(raw))
        ) {
            value = Number(raw);
        }

        return {
            hour: i,
            value
        };

    })
    : [];

    const domain = {
        pressure: [0, 15],
        bz: [-40, 20],
        sym: [-400, 50]
    }[parameter];

    const x = d3.scaleLinear()
        .domain([0, 71])
        .range([margin.left, width - margin.right]);

    const y = d3.scaleLinear()
        .domain(domain)
        .range([height - margin.bottom, margin.top]);

    // Grid
    svg.append("g")
        .selectAll("line")
        .data(y.ticks(5))
        .join("line")
        .attr("x1", margin.left)
        .attr("x2", width - margin.right)
        .attr("y1", d => y(d))
        .attr("y2", d => y(d))
        .attr("stroke", "#1e293b")
        .attr("stroke-width", 1);

    const line = d3.line()
    .defined(d => d.value !== null)
    .x(d => x(d.hour))
    .y(d => y(d.value));

    // Draw Reference Storm (if saved)
if (referenceStorm) {

    svg.append("path")
        .datum(referencePlotData)
        .attr("fill", "none")
        .attr("stroke", "#94a3b8")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "6 4")
        .attr("d", line);

}

    svg.append("path")
        .datum(plotData)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", 2.5)
        .attr("d", line);

    // Shock arrival
    svg.append("line")
        .attr("x1", x(0))
        .attr("x2", x(0))
        .attr("y1", margin.top)
        .attr("y2", height - margin.bottom)
        .attr("stroke", "#8b5cf6")
        .attr("stroke-width", 2);
    // X Axis
const xAxis = d3.axisBottom(x)
    .tickValues([0, 12, 24, 36, 48, 60, 72]);

svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(xAxis)
    .call(g => g.select(".domain").attr("stroke", "#334155"))
    .call(g => g.selectAll("line").attr("stroke", "#334155"))
    .call(g => g.selectAll("text")
        .attr("fill", "#64748b")
        .style("font-size", "10px"));
svg.append("text")
    .attr("x", width / 2)
    .attr("y", height - 5)
    .attr("text-anchor", "middle")
    .attr("fill", "#64748b")
    .style("font-size", "10px")
    .text("Hours Relative to Shock Arrival");

// Y Axis
const yAxis = d3.axisLeft(y)
    .ticks(5);

svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(yAxis)
    .call(g => g.select(".domain").attr("stroke", "#334155"))
    .call(g => g.selectAll("line").attr("stroke", "#334155"))
    .call(g => g.selectAll("text")
        .attr("fill", "#64748b")
        .style("font-size", "10px"));
svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", 12)
    .attr("text-anchor", "middle")
    .attr("fill", "#64748b")
    .style("font-size", "10px")
    .text(
        parameter === "pressure"
            ? "nPa"
            : parameter === "bz"
            ? "nT"
            : "nT"
    );

}, [currentStorm, referenceStorm, parameter, sizeTick]);



  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden h-full flex flex-col">

      {/* ================= HEADER ================= */}

      <div className="border-b border-slate-800 px-3 py-1.5 bg-slate-900/60">

        <div className="flex items-center gap-2">

          <span className="text-sm font-semibold text-slate-200 truncate" title="Storm Event Inspector — 72 h comparison against a saved reference storm">
            Storm Inspector
          </span>

          <div className="ml-auto flex flex-none gap-1.5">

            <button
              onClick={() => currentStorm && setReferenceStorm(currentStorm)}
              title="Save the current storm as the dashed reference overlay"
              className="px-2 py-1 text-[10px] whitespace-nowrap rounded bg-violet-600 hover:bg-violet-500 text-white transition"
            >
              Set Reference
            </button>

            <button
              onClick={() => setReferenceStorm(null)}
              title="Clear the reference overlay"
              className="px-2 py-1 text-[10px] whitespace-nowrap rounded bg-slate-800 border border-slate-700 hover:bg-slate-700 transition"
            >
              Clear
            </button>

          </div>

        </div>

      </div>

      {/* ================= PARAMETER + STORM INFO (one compact row) ================= */}

     <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-1.5 text-xs">

  <select
    value={parameter}
    onChange={(e)=>setParameter(e.target.value)}
    title="72-hour window from shock arrival"
    className="bg-slate-800 text-[10px] border border-slate-700 rounded px-2 py-0.5 flex-none"
  >
    <option value="pressure">Pressure</option>
    <option value="bz">IMF Bz</option>
    <option value="sym">SYM/H</option>
  </select>

  <div className="flex items-center gap-3">

  <div className="flex items-center gap-1.5">
    <span className="w-2 h-2 rounded-full bg-red-500" />
    <span className="text-slate-500">Ref</span>
    <span className="text-slate-200">
{
referenceStorm
?
new Date(referenceStorm.startTime).toLocaleDateString(
    "en-GB",
    {
        day:"2-digit",
        month:"short",
        year:"2-digit"
    }
)
:
"None"
}
</span>
  </div>

  <div className="flex items-center gap-1.5">
    <span
      className={`w-2 h-2 rounded-full ${
        currentStorm ? "bg-green-500" : "bg-slate-500"
      }`}
    />

    <span className="text-slate-500">Cur</span>

    <span className="text-slate-200">
      {currentStorm
        ? new Date(currentStorm.startTime).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "2-digit"
          })
        : "None"}
    </span>
  </div>

  </div>

</div>

      {/* ================= METRICS ================= */}

<div className="grid grid-cols-3 gap-1.5 px-2 py-1 border-b border-slate-800">
  {[
    { label: "Max Pressure", unit: "nPa", cls: "text-yellow-400", value: currentStorm ? currentStorm.peakPressure.toFixed(1) : "—" },
    { label: "Min Bz",       unit: "nT",  cls: "text-red-400",    value: currentStorm ? currentStorm.minBz.toFixed(1) : "—" },
    { label: "Min SYM-H",    unit: "nT",  cls: "text-sky-400",    value: currentStorm ? currentStorm.minSymH.toFixed(1) : "—" },
  ].map(m => (
    <div key={m.label} className="rounded-lg bg-slate-800/60 border border-slate-800 text-center py-1">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{m.label}</div>
      <div className={`text-sm font-semibold leading-tight ${m.cls}`}>
        {m.value}
        <span className="ml-1 text-[9px] font-normal text-slate-500">{m.unit}</span>
      </div>
    </div>
  ))}
</div>

      {/* ================= PLOTS ================= */}
      {/* <div className="flex-1 flex flex-col">

<div className="px-3 pt-2 text-[11px] font-medium text-slate-400">

{

parameter==="pressure"

? "Dynamic Pressure"

: parameter==="bz"

? "IMF Bz"

: "SYM/H"

}

</div>

<div className="flex-1 relative bg-[#050d1a]">

<div
className="absolute top-0 bottom-0 left-0
w-px bg-indigo-500 z-20"
/>

</div>

</div>
       */}
       <div ref={wrapRef} className="flex-1 min-h-0 relative bg-[#050d1a] overflow-hidden">

    <svg
        ref={svgRef}
        style={{ display: 'block' }}
    />

</div>


          

            

          


      {/* ================= X AXIS ================= */}


    </div>
  )
}