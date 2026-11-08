export function Field({ label, children, hint }) {
  return (
    <div>
      <p className="bh-label mb-1.5">{label}</p>
      {children}
      {hint && (
        <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
          {hint}
        </p>
      )}
    </div>
  )
}

export function Input({ value, onChange, placeholder, type = 'text' }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="bh-input"
    />
  )
}

export function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="bh-input">
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function TextArea({ value, onChange, placeholder, rows = 4, mono = false }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      spellCheck={false}
      className={mono ? 'bh-mono-editor' : 'bh-input'}
    />
  )
}

export function Checkbox({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <span
        onClick={() => onChange(!checked)}
        className="w-4 h-4 rounded-[3px] flex items-center justify-center flex-shrink-0 transition-colors"
        style={{ background: checked ? 'var(--accent)' : 'var(--fill-3)' }}
      >
        {checked && (
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
            <path d="M1 3.5L3.2 5.7L8 1" stroke="var(--on-accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {label && (
        <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </span>
      )}
    </label>
  )
}
