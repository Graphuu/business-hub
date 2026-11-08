import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART_COLORS } from '../../chartColors'
import ChartTooltip from './ChartTooltip'
import { toObjectRows } from './helpers'

export default function BarChartWidget({ widget, data }) {
  const spec = widget.spec || {}
  const rows = toObjectRows(data)
  const yColumns = spec.y_columns?.length ? spec.y_columns : (data.columns || []).filter((c) => c !== spec.x_column)

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
        <XAxis
          dataKey={spec.x_column}
          tick={{ fill: CHART_COLORS.tick, fontSize: 11 }}
          axisLine={{ stroke: CHART_COLORS.axisLine }}
          tickLine={false}
        />
        <YAxis tick={{ fill: CHART_COLORS.tick, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(61,214,163,0.08)' }} />
        {yColumns.map((col, i) => (
          <Bar
            key={col}
            dataKey={col}
            fill={CHART_COLORS.series[i % CHART_COLORS.series.length]}
            radius={[2, 2, 0, 0]}
            animationDuration={900}
            animationEasing="ease-out"
            maxBarSize={46}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
