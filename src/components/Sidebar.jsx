// Numbered nav: one card per subpage, active item picked out with a
// space-fast border/glow. Kept generic on `sections` (not hardcoded to a
// specific count).
export default function Sidebar({ sections, activeId, onSelect }) {
  return (
    <nav className="flex-none w-72 h-full overflow-y-auto pr-1 flex flex-col gap-3">
      {sections.map((s, i) => {
        const active = s.id === activeId
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`group text-left rounded-xl border px-4 py-3.5 flex items-start gap-3 transition-all duration-150 ${
              active
                ? 'border-space-fast bg-space-fast/10 shadow-[0_0_0_1px_rgba(67,217,200,0.25)]'
                : 'border-space-hairline bg-space-panel hover:bg-space-panel-2 hover:border-space-fast/40 hover:translate-x-1 hover:shadow-[0_0_12px_rgba(67,217,200,0.08)]'
            }`}
          >
            <span
              className={`flex-none w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-semibold transition-colors duration-150 ${
                active
                  ? 'bg-space-fast text-space-bg'
                  : 'bg-space-panel-2 text-space-dim border border-space-hairline group-hover:border-space-fast/60 group-hover:text-space-text'
              }`}
            >
              {i + 1}
            </span>
            <span className="flex flex-col gap-1 min-w-0">
              <span className={`text-sm font-semibold ${active ? 'text-space-text' : 'text-space-text/90 group-hover:text-space-text'}`}>{s.title}</span>
              <span className="text-xs text-space-dim leading-snug">{s.description}</span>
            </span>
          </button>
        )
      })}
    </nav>
  )
}
