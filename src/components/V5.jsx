export default function V5() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 bg-slate-900/60">
        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-indigo-400 tracking-wider">V5</span>
        <span className="text-sm font-semibold text-slate-200">Orbital Exposure Simulator</span>
        <span className="hidden sm:block text-[10px] text-slate-500 ml-auto">
          Earth magnetosphere · LEO / MEO / GEO / Polar · animated pressure response
        </span>
      </div>

      <div className="relative flex items-center justify-center h-64 overflow-hidden gap-8">
        {/* Decorative orbit diagram */}
        <svg className="absolute inset-0 w-full h-full opacity-25" viewBox="0 0 420 200" aria-hidden="true">
          {/* Magnetosphere (compressed on left) */}
          <ellipse cx="210" cy="100" rx="120" ry="80" fill="none" stroke="#3b82f6" strokeWidth="1" strokeDasharray="6,4" />
          {/* Orbital rings */}
          <ellipse cx="210" cy="100" rx="30" ry="18" fill="none" stroke="#4ade80" strokeWidth="1" />
          <ellipse cx="210" cy="100" rx="55" ry="33" fill="none" stroke="#60a5fa" strokeWidth="1" />
          <ellipse cx="210" cy="100" rx="80" ry="48" fill="none" stroke="#fbbf24" strokeWidth="1" />
          {/* Earth */}
          <circle cx="210" cy="100" r="12" fill="#1e3a5f" stroke="#3b82f6" strokeWidth="1.5" />
          {/* Satellites */}
          <circle cx="210" cy="82" r="2.5" fill="#4ade80" />
          <circle cx="265" cy="100" r="2.5" fill="#60a5fa" />
          <circle cx="290" cy="100" r="2.5" fill="#fbbf24" />
          {/* Solar wind arrow */}
          <line x1="20" y1="100" x2="80" y2="100" stroke="#f87171" strokeWidth="1.5" markerEnd="url(#arr)" />
          <defs>
            <marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#f87171" />
            </marker>
          </defs>
          <text x="22" y="92" fill="#f87171" fontSize="7" fontFamily="monospace">solar wind</text>
        </svg>

        {/* Legend */}
        <div className="relative flex gap-4 text-[10px] font-mono text-slate-500">
          {[
            { color: '#4ade80', label: 'LEO' },
            { color: '#60a5fa', label: 'MEO' },
            { color: '#fbbf24', label: 'GEO' },
            { color: '#3b82f6', label: 'Magnetopause' },
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
              {label}
            </span>
          ))}
        </div>

        <p className="relative text-xs text-slate-500 font-mono text-center">
          Canvas orbital simulator — coming soon
        </p>
      </div>
    </div>
  )
}
