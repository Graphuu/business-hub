import { TrendingUp } from 'lucide-react'
import AnimatedNumber from '../AnimatedNumber'

export default function KpiWidget({ widget, data }) {
  const spec = widget.spec || {}
  const row = data?.rows?.[0]
  const colIndex = data?.columns?.indexOf(spec.value_column)
  const value = row && colIndex >= 0 ? row[colIndex] : 0

  return (
    <div className="h-full flex flex-col justify-between">
      <p className="bh-label">{widget.title}</p>
      <div className="flex items-end justify-between">
        <p className="text-[26px] leading-none font-bold font-display" style={{ color: 'var(--text-primary)' }}>
          <AnimatedNumber value={value} format={spec.format} />
        </p>
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--accent-soft)' }}
        >
          <TrendingUp size={15} style={{ color: 'var(--accent-ink)' }} strokeWidth={2} />
        </div>
      </div>
    </div>
  )
}
