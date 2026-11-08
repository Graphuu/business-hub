import { AnimatePresence, motion } from 'framer-motion'
import {
  Database, GitBranch, LayoutDashboard, LayoutGrid,
  Plug, RefreshCw, Sparkles, TerminalSquare, Wand2,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { seedMockDemo } from '../api/businessHub'
import Logo from './Logo'
import { useToast } from './Toast'

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/ai', label: 'AI Builder', icon: Wand2, badge: 'AI' },
  { to: '/sources', label: 'Data Sources', icon: Plug },
  { to: '/pipelines', label: 'Pipelines', icon: RefreshCw },
  { to: '/transforms', label: 'Transforms', icon: GitBranch },
  { to: '/datasets', label: 'Datasets', icon: Database },
  { to: '/query', label: 'Ad Hoc Query', icon: TerminalSquare },
  { to: '/dashboards', label: 'Dashboards', icon: LayoutDashboard },
]

const EASE = [0.16, 1, 0.3, 1]

export default function Layout({ children }) {
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [seeding, setSeeding] = useState(false)

  const reseed = async () => {
    setSeeding(true)
    try {
      const result = await seedMockDemo()
      toast.success(`Demo data refreshed — ${result.bronze_orders_rows + result.bronze_customers_rows} rows ingested, ${result.gold_tables.length} gold tables, ${result.widget_count} widgets.`)
      navigate(`/dashboards/${result.dashboard_id}`)
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to seed demo data')
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div className="relative flex min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="bh-backdrop" aria-hidden />

      <motion.aside
        initial={{ x: -24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="relative z-10 w-60 flex-shrink-0 flex flex-col justify-between h-screen sticky top-0 px-3 py-6"
        style={{ background: 'rgba(255,255,255,0.78)', backdropFilter: 'blur(14px)', borderRight: '1px solid var(--hairline)' }}
      >
        <div>
          <div className="flex items-center gap-2.5 px-3 mb-9">
            <motion.div whileHover={{ rotate: -8, scale: 1.06 }} transition={{ type: 'spring', stiffness: 400, damping: 14 }}>
              <Logo size={28} />
            </motion.div>
            <p className="font-display font-semibold text-[15px] tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Business Hub
            </p>
          </div>

          <nav className="flex flex-col gap-0.5">
            {NAV.map((item, i) => (
              <motion.div
                key={item.to}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.1 + i * 0.04, ease: EASE }}
              >
                <NavLink to={item.to} end={item.end}>
                  {({ isActive }) => (
                    <div className="relative px-3 py-2 rounded-md flex items-center gap-2.5 group transition-colors hover:bg-ink/[0.04]">
                      {isActive && (
                        <motion.div
                          layoutId="nav-active-pill"
                          className="absolute inset-0 rounded-md"
                          style={{ background: 'var(--accent-soft)' }}
                          transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                        >
                          <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-[1px]" style={{ background: 'var(--accent)' }} />
                        </motion.div>
                      )}
                      <item.icon
                        size={15.5}
                        strokeWidth={1.9}
                        className="relative z-10 flex-shrink-0 transition-all duration-200 group-hover:scale-110"
                        style={{ color: isActive ? 'var(--accent-ink)' : 'var(--text-secondary)' }}
                      />
                      <span
                        className="relative z-10 text-[13px] transition-all duration-200 group-hover:translate-x-0.5"
                        style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: isActive ? 600 : 400 }}
                      >
                        {item.label}
                      </span>
                      {item.badge && (
                        <span className="relative z-10 ml-auto text-[9.5px] font-semibold px-1.5 py-px rounded-[3px] bh-badge-shimmer" style={{ color: 'var(--on-accent)' }}>
                          {item.badge}
                        </span>
                      )}
                    </div>
                  )}
                </NavLink>
              </motion.div>
            ))}
          </nav>
        </div>

        <div className="px-2">
          <button
            onClick={reseed}
            disabled={seeding}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors hover:bg-ink/[0.05] disabled:opacity-50"
          >
            <Sparkles size={14} className={seeding ? 'animate-spin flex-shrink-0' : 'flex-shrink-0'} style={{ color: 'var(--accent-ink)' }} />
            <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
              {seeding ? 'Seeding…' : 'Reseed Demo Data'}
            </span>
          </button>
          <p className="px-3 mt-2.5 text-[10.5px] flex items-center gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inset-0 rounded-full animate-ping" style={{ background: 'var(--accent)', opacity: 0.6 }} />
              <span className="relative w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
            </span>
            DuckDB · runs entirely local
          </p>
        </div>
      </motion.aside>

      <main className="relative z-10 flex-1 min-w-0 px-10 py-9">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
