import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART_COLORS } from '../../chartColors'
import ChartTooltip from './ChartTooltip'
import { toObjectRows } from './helpers'

export default function AreaChartWidget({ widget, data }) {
  const spec = widget.spec || {}
  const rows = toObjectRows(data)
  const yColumns = spec.y_columns?.length ? spec.y_columns : (data.columns || []).filter((c) => c !== spec.x_column)
  const isLine = widget.widget_type === 'line'
  const Chart = isLine ? LineChart : AreaChart

  return (
    <ResponsiveContainer width="100%" height="100%">
      <Chart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          {yColumns.map((col, i) => (
            <linearGradient key={col} id={`grad-${widget.id}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.series[i % CHART_COLORS.series.length]} stopOpacity={0.35} />
              <stop offset="100%" stopColor={CHART_COLORS.series[i % CHART_COLORS.series.length]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
        <XAxis
          dataKey={spec.x_column}
          tick={{ fill: CHART_COLORS.tick, fontSize: 11 }}
          axisLine={{ stroke: CHART_COLORS.axisLine }}
          tickLine={false}
        />
        <YAxis tick={{ fill: CHART_COLORS.tick, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: CHART_COLORS.axisLine }} />
        {yColumns.map((col, i) =>
          isLine ? (
            <Line
              key={col}
              type="monotone"
              dataKey={col}
              stroke={CHART_COLORS.series[i % CHART_COLORS.series.length]}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
              animationDuration={1000}
              animationEasing="ease-out"
            />
          ) : (
            <Area
              key={col}
              type="monotone"
              dataKey={col}
              stroke={CHART_COLORS.series[i % CHART_COLORS.series.length]}
              strokeWidth={2.5}
              fill={`url(#grad-${widget.id}-${i})`}
              animationDuration={1000}
              animationEasing="ease-out"
            />
          )
        )}
      </Chart>
    </ResponsiveContainer>
  )
}
