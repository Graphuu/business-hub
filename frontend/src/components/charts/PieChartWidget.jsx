import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { CHART_COLORS } from '../../chartColors'
import ChartTooltip from './ChartTooltip'
import { toObjectRows } from './helpers'

export default function PieChartWidget({ widget, data }) {
  const spec = widget.spec || {}
  const rows = toObjectRows(data)

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={rows}
          dataKey={spec.value_column}
          nameKey={spec.label_column}
          cx="50%"
          cy="46%"
          innerRadius="52%"
          outerRadius="82%"
          paddingAngle={3}
          animationDuration={900}
          animationEasing="ease-out"
        >
          {rows.map((_, i) => (
            <Cell
              key={i}
              fill={CHART_COLORS.series[i % CHART_COLORS.series.length]}
              stroke={CHART_COLORS.surface}
              strokeWidth={2}
            />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
        <Legend
          verticalAlign="bottom"
          height={28}
          iconType="circle"
          iconSize={7}
          formatter={(value) => <span style={{ color: 'var(--text-secondary)', fontSize: 11.5 }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
