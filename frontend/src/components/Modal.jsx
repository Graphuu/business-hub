import { AnimatePresence, motion } from 'framer-motion'

export default function Modal({ open, onClose, title, children, width = 560 }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(36,41,46,0.28)', backdropFilter: 'blur(6px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="max-h-[88vh] overflow-y-auto rounded-xl p-6"
            style={{ width, maxWidth: '92vw', background: 'var(--surface-raised)', border: '1px solid var(--hairline)', boxShadow: '0 30px 80px -24px rgba(31,35,40,0.35)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {title && (
              <h2 className="text-lg font-semibold font-display mb-4" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                {title}
              </h2>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
