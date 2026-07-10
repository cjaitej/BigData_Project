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
const [referenceStorm, setReferenceStorm] = useState(null);

useEffect(() => {

    if (!currentStorm) return;

    const svg = d3.select(svgRef.current);

    svg.selectAll("*").remove();

    const width = 700;
    const height = 180;

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
        .attr("stroke", "#6366f1")
        .attr("stroke-width", 2);
    // X Axis
const xAxis = d3.axisBottom(x)
    .tickValues([0, 12, 24, 36, 48, 60, 72]);

svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(xAxis)
    .call(g => g.select(".domain").attr("stroke", "#475569"))
    .call(g => g.selectAll("line").attr("stroke", "#475569"))
    .call(g => g.selectAll("text")
        .attr("fill", "#94a3b8")
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
    .call(g => g.select(".domain").attr("stroke", "#475569"))
    .call(g => g.selectAll("line").attr("stroke", "#475569"))
    .call(g => g.selectAll("text")
        .attr("fill", "#94a3b8")
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

}, [currentStorm,referenceStorm, parameter]); 



  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden h-full flex flex-col">

      {/* ================= HEADER ================= */}

      <div className="border-b border-slate-800 px-3 py-2 bg-slate-900/60">

        <div className="flex items-center">

          <div className="flex items-center gap-2">

            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-indigo-400 tracking-wider">
              V4
            </span>

            <span className="text-sm font-semibold text-slate-200">
              Storm Event Inspector
            </span>

          </div>

          <div className="ml-auto flex gap-2">

            <button
    onClick={() => currentStorm && setReferenceStorm(currentStorm)}
    className="px-2 py-1 text-[10px] rounded bg-indigo-600 hover:bg-indigo-500 text-white transition"
>
    Set Current
</button>

            <button
    onClick={() => setReferenceStorm(null)}
    className="px-2 py-1 text-[10px] rounded bg-slate-800 border border-slate-700 hover:bg-slate-700 transition"
>
    Clear
</button>

          </div>

        </div>

        <div className="mt-1 text-[10px] text-slate-500">
          <div className="flex items-center gap-2 mt-1">

<select

value={parameter}

onChange={(e)=>setParameter(e.target.value)}

className="bg-slate-800 text-[10px] border border-slate-700 rounded px-2 py-0.5"

>

<option value="pressure">Pressure</option>

<option value="bz">IMF Bz</option>

<option value="sym">SYM/H</option>

</select>

<span className="text-[10px] text-slate-500">

72 h comparison

</span>

</div>
        </div>

      </div>

      {/* ================= STORM INFO ================= */}

     <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2 text-xs">

  <div className="flex items-center gap-2">
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

  <div className="flex items-center gap-2">
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

      {/* ================= METRICS ================= */}

<div className="flex items-center justify-center gap-6 border-b border-slate-800 py-2 text-xs">

  <div className="flex items-center gap-1">
    <span className="text-slate-500">Max P</span>
    <span className="font-semibold text-yellow-400">
      {currentStorm ? currentStorm.peakPressure.toFixed(1) : "—"}
    </span>
  </div>

  <div className="flex items-center gap-1">
    <span className="text-slate-500">Min Bz</span>
    <span className="font-semibold text-red-400">
      {currentStorm ? currentStorm.minBz.toFixed(1) : "—"}
    </span>
  </div>

  <div className="flex items-center gap-1">
    <span className="text-slate-500">Min SYM</span>
    <span className="font-semibold text-sky-400">
      {currentStorm ? currentStorm.minSymH.toFixed(1) : "—"}
    </span>
  </div>

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
       <div className="flex-1 relative bg-[#050d1a]">

    <svg
        ref={svgRef}
        viewBox="0 0 700 180"
        className="w-full h-full"
        preserveAspectRatio="none"
    />

</div>


          

            

          


      {/* ================= X AXIS ================= */}


    </div>
  )
}