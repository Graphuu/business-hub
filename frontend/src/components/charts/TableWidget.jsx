export default function TableWidget({ widget, data }) {
  const spec = widget.spec || {}
  const columns = spec.columns?.length ? spec.columns : data?.columns || []
  const colIndexes = columns.map((c) => data.columns.indexOf(c))

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                className="text-left pb-2 pr-3 sticky top-0 font-medium"
                style={{ color: 'var(--text-tertiary)', background: 'var(--surface)' }}
              >
                {formatHeader(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(data?.rows || []).map((row, ri) => (
            <tr key={ri} style={{ borderTop: '1px solid var(--hairline)' }}>
              {colIndexes.map((ci, i) => (
                <td key={i} className="py-2 pr-3 font-mono-num" style={{ color: 'var(--text-primary)' }}>
                  {formatCell(row[ci])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatHeader(c) {
  return c.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}

function formatCell(v) {
  if (typeof v === 'number') return v.toLocaleString('en-US')
  return v ?? '—'
}
