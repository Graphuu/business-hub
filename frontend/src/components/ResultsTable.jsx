export default function ResultsTable({ data, maxHeight = 360 }) {
  if (!data?.columns?.length) {
    return (
      <p className="text-xs py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>
        No rows returned.
      </p>
    )
  }
  return (
    <div className="overflow-auto rounded-2xl" style={{ maxHeight, background: 'var(--fill-1)' }}>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            {data.columns.map((c) => (
              <th
                key={c}
                className="text-left px-3 py-2.5 sticky top-0 font-medium whitespace-nowrap"
                style={{ color: 'var(--text-tertiary)', background: 'var(--surface-raised)' }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, ri) => (
            <tr key={ri} style={{ borderTop: '1px solid var(--hairline)' }}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 font-mono-num whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                  {formatCell(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatCell(v) {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return v.toLocaleString('en-US')
  return String(v)
}
