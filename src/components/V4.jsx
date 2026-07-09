export default function V4() {
  return (
    <div className="h-full flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="flex-none flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-900/60">
        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-indigo-400 tracking-wider">V4</span>
        <span className="text-sm font-semibold text-slate-200">Storm Event Inspector</span>
        <span className="hidden sm:block text-[10px] text-slate-500 ml-auto">
          72-hour detail · coming soon
        </span>
      </div>

      <div className="relative flex flex-col items-center justify-center flex-1 min-h-0 gap-3 overflow-hidden">
        {/* Decorative waveform lines */}
        <svg className="absolute inset-0 w-full h-full opacity-20" aria-hidden="true">
          {[
            { d: 'M 0 60 C 60 60, 100 30, 150 20 S 250 10, 300 5 S 380 30, 420 60', color: '#f87171' },
            { d: 'M 0 80 C 60 75, 100 65, 150 50 S 250 40, 300 45 S 380 70, 420 80', color: '#60a5fa' },
            { d: 'M 0 50 C 60 50, 100 45, 150 60 S 250 75, 300 70 S 380 55, 420 50', color: '#4ade80' },
          ].map((p, i) => (
            <path key={i} d={p.d} stroke={p.color} strokeWidth="1.5" fill="none" />
          ))}
          <line x1="190" y1="10%" x2="190" y2="90%" stroke="#f87171" strokeWidth="1" strokeDasharray="4,3" />
        </svg>
        <p className="relative text-xs text-slate-500 font-mono text-center px-6">
          Detailed storm inspector with lag slider<br />
          <span className="text-slate-600">coming soon</span>
        </p>
      </div>
    </div>
  )
}
