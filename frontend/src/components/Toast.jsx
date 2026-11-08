import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'
import { createContext, useCallback, useContext, useState } from 'react'

const ToastCtx = createContext(null)

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])

  const push = useCallback((message, kind) => {
    const id = Math.random().toString(36).slice(2)
    setItems((cur) => [...cur, { id, message, kind }])
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), 4200)
  }, [])

  const api = {
    success: (m) => push(m, 'success'),
    error: (m) => push(m, 'error'),
  }

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2 items-end pointer-events-none">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 14, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="pointer-events-auto flex items-start gap-2.5 pl-3.5 pr-4 py-3 rounded-lg max-w-sm"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--hairline)',
                borderLeft: `3px solid ${t.kind === 'error' ? 'var(--danger)' : 'var(--accent)'}`,
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              {t.kind === 'error' ? (
                <AlertCircle size={16} style={{ color: 'var(--danger)' }} className="mt-0.5 flex-shrink-0" />
              ) : (
                <CheckCircle2 size={16} style={{ color: 'var(--success)' }} className="mt-0.5 flex-shrink-0" />
              )}
              <p className="text-sm leading-snug" style={{ color: 'var(--text-primary)' }}>{t.message}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
