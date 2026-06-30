export default function V2() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 bg-slate-900/60">
        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-indigo-400 tracking-wider">V2</span>
        <span className="text-sm font-semibold text-slate-200">Phase Space Explorer</span>
        <span className="hidden sm:block text-[10px] text-slate-500 ml-auto">
          Velocity vs. density · colored by |B|, Bz, or Kp
        </span>
      </div>

      <div className="relative flex flex-col items-center justify-center h-52 gap-3 overflow-hidden">
        {/* Decorative scatter dots */}
        <svg className="absolute inset-0 w-full h-full opacity-20" aria-hidden="true">
          {[
            [20,70],[35,45],[50,60],[65,30],[80,55],[25,80],[60,20],[45,75],
            [70,65],[30,35],[55,85],[40,50],[75,40],[15,55],[85,70],[50,30],
          ].map(([cx, cy], i) => (
            <circle
              key={i}
              cx={`${cx}%`} cy={`${cy}%`}
              r={2 + (i % 4)}
              fill={['#4ade80','#60a5fa','#f87171','#fbbf24'][i % 4]}
            />
          ))}
          <line x1="10%" y1="90%" x2="90%" y2="90%" stroke="#334155" strokeWidth="1" />
          <line x1="10%" y1="10%" x2="10%" y2="90%" stroke="#334155" strokeWidth="1" />
        </svg>
        <p className="relative text-xs text-slate-500 font-mono text-center px-6">
          D3 scatter plot with lasso selection<br />
          <span className="text-slate-600">coming soon</span>
        </p>
      </div>
    </div>
  )
}
