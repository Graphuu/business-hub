export default function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-xl px-3 py-2 text-xs"
      style={{ background: 'var(--surface-raised)', boxShadow: 'var(--shadow-lg)' }}
    >
      {label != null && (
        <p className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
          {String(label)}
        </p>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color || p.fill }} />
          <span style={{ color: 'var(--text-secondary)' }}>{p.name}:</span>
          <span className="font-mono-num font-medium" style={{ color: 'var(--text-primary)' }}>
            {typeof p.value === 'number' ? p.value.toLocaleString('en-US') : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}
