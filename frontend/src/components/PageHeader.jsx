import { motion } from 'framer-motion'

const EASE = [0.16, 1, 0.3, 1]

export default function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-10 flex-wrap">
      <div>
        {eyebrow && (
          <span className="bh-label bh-eyebrow mb-2.5" style={{ color: 'var(--accent-ink)' }}>
            {eyebrow}
          </span>
        )}
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.05 }}
          className="text-[34px] font-semibold font-display leading-none"
          style={{ color: 'var(--text-primary)', letterSpacing: '-0.03em' }}
        >
          {title}
        </motion.h1>
        {description && (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE, delay: 0.12 }}
            className="text-[15px] mt-3 max-w-xl leading-relaxed"
            style={{ color: 'var(--text-secondary)' }}
          >
            {description}
          </motion.p>
        )}
      </div>
      {actions && (
        <motion.div
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.15 }}
          className="flex items-center gap-2 flex-shrink-0 pb-1"
        >
          {actions}
        </motion.div>
      )}
    </div>
  )
}
