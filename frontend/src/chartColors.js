// Hardcoded hex (not CSS custom properties) — these values feed directly
// into Recharts' SVG fill/stroke props, and SVG presentation-attribute
// var() resolution is inconsistent enough across renderers that it's not
// worth the risk for the one place a blank chart would be most visible.
export const CHART_COLORS = {
  mint: '#2FC794',
  graphite: '#4B5563',
  azure: '#4A9FE0',
  amber: '#F0A93B',
  series: ['#2FC794', '#4B5563', '#4A9FE0', '#F0A93B'],
  grid: 'rgba(31,35,40,0.07)',
  axisLine: 'rgba(31,35,40,0.14)',
  tick: '#8B949E',
  surface: '#FFFFFF',
}
