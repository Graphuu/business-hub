export function toObjectRows(data) {
  if (!data?.columns || !data?.rows) return []
  return data.rows.map((r) => Object.fromEntries(data.columns.map((c, i) => [c, r[i]])))
}
