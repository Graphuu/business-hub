import { animate, useMotionValue } from 'framer-motion'
import { useEffect, useRef } from 'react'

export default function AnimatedNumber({ value, format = 'number', duration = 1.1 }) {
  const mv = useMotionValue(0)
  const ref = useRef(null)

  useEffect(() => {
    if (ref.current) ref.current.textContent = formatValue(0, format)
    const controls = animate(mv, Number(value) || 0, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = formatValue(v, format)
      },
    })
    return controls.stop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, format])

  return <span ref={ref} className="font-mono-num" />
}

function formatValue(v, format) {
  if (format === 'currency') return '$' + Math.round(v).toLocaleString('en-US')
  if (format === 'percent') return v.toFixed(1) + '%'
  return Math.round(v).toLocaleString('en-US')
}
