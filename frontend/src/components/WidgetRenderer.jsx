import AreaChartWidget from './charts/AreaChartWidget'
import BarChartWidget from './charts/BarChartWidget'
import KpiWidget from './charts/KpiWidget'
import PieChartWidget from './charts/PieChartWidget'
import TableWidget from './charts/TableWidget'

export default function WidgetRenderer({ widget, data, error }) {
  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-center px-4" style={{ color: 'var(--danger)' }}>
        {error}
      </div>
    )
  }
  if (!data) {
    return (
      <div className="h-full flex items-center justify-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
        No data
      </div>
    )
  }
  switch (widget.widget_type) {
    case 'kpi':
      return <KpiWidget widget={widget} data={data} />
    case 'bar':
      return <BarChartWidget widget={widget} data={data} />
    case 'pie':
      return <PieChartWidget widget={widget} data={data} />
    case 'area':
    case 'line':
      return <AreaChartWidget widget={widget} data={data} />
    case 'table':
      return <TableWidget widget={widget} data={data} />
    default:
      return (
        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Unknown widget type: {widget.widget_type}
        </div>
      )
  }
}
