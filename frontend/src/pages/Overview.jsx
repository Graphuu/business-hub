import { motion } from 'framer-motion'
import { ArrowUpRight, LayoutDashboard, Plug, Sparkles, Wand2, Workflow } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listDashboards, listDatasets, listIntegrations, listPipelines, seedMockDemo } from '../api/businessHub'
import AnimatedNumber from '../components/AnimatedNumber'
import { useToast } from '../components/Toast'

const EASE = [0.16, 1, 0.3, 1]

export default function Overview() {
  const toast = useToast()
  const navigate = useNavigate()
  const [datasets, setDatasets] = useState([])
  const [pipelines, setPipelines] = useState([])
  const [integrations, setIntegrations] = useState([])
  const [dashboards, setDashboards] = useState([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)

  useEffect(() => {
    Promise.all([listDatasets(), listPipelines(), listIntegrations(), listDashboards()])
      .then(([d, p, i, db]) => {
        setDatasets(d)
        setPipelines(p)
        setIntegrations(i)
        setDashboards(db)
      })
      .finally(() => setLoading(false))
  }, [])

  const totalRows = datasets.reduce((s, d) => s + (d.row_count || 0), 0)
  const goldCount = datasets.filter((d) => d.layer === 'gold').length
  const isEmpty = !loading && integrations.length === 0

  const runSeed = async () => {
    setSeeding(true)
    try {
      const result = await seedMockDemo()
      toast.success('Demo data is live — bronze, silver, and gold all populated.')
      navigate(`/dashboards/${result.dashboard_id}`)
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to seed demo data')
    } finally {
      setSeeding(false)
    }
  }

  const stats = [
    { label: 'Datasets tracked', value: datasets.length },
    { label: 'Rows under governance', value: totalRows },
    { label: 'Gold tables', value: goldCount },
    { label: 'Dashboards live', value: dashboards.length },
  ]

  return (
    <div>
      {/* Hero — the front door: big, centered, confident. No card, no chrome. */}
      <section className="text-center max-w-2xl mx-auto pt-10 pb-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="relative w-14 h-14 rounded-lg mx-auto mb-8 flex items-center justify-center"
          style={{ background: 'linear-gradient(155deg, #6BE8BF, #2FC794)', boxShadow: '0 10px 30px -10px var(--accent-glow)' }}
        >
          <span className="bh-pulse-ring" aria-hidden />
          <svg width="26" height="26" viewBox="0 0 100 100" fill="none">
            <path d="M28 68V32h20a12 12 0 0 1 0 24H30M28 50h22a10 10 0 0 1 0 20H28" stroke="var(--on-accent)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.05 }}
          className="font-display font-semibold"
          style={{ fontSize: 'clamp(2.5rem, 6vw, 4.25rem)', letterSpacing: '-0.045em', lineHeight: 1.04, color: 'var(--text-primary)' }}
        >
          Making data cost
          <br />
          <span className="bh-gradient-text">predictable.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.15 }}
          className="text-[17px] mt-6 leading-relaxed"
          style={{ color: 'var(--text-secondary)', maxWidth: 460, marginInline: 'auto' }}
        >
          Ingest, govern, and visualize every dataset that touches the bottom line — bronze to gold, on an engine that runs entirely on this machine.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.25 }}
          className="flex items-center justify-center gap-3 mt-9"
        >
          {dashboards.length > 0 ? (
            <button onClick={() => navigate(`/dashboards/${dashboards[0].id}`)} className="bh-btn-primary flex items-center gap-1.5 !px-5 !py-2.5 !text-sm">
              Open Dashboard <ArrowUpRight size={15} />
            </button>
          ) : (
            <button onClick={runSeed} disabled={seeding} className="bh-btn-primary flex items-center gap-2 !px-5 !py-2.5 !text-sm">
              <Sparkles size={14} className={seeding ? 'animate-spin' : ''} />
              {seeding ? 'Seeding…' : 'Seed Demo Data'}
            </button>
          )}
          <button onClick={() => navigate('/ai')} className="bh-btn-ghost flex items-center gap-1.5 !px-5 !py-2.5 !text-sm">
            <Wand2 size={14} /> Build with AI
          </button>
          <button onClick={() => navigate('/sources')} className="bh-btn-ghost !px-5 !py-2.5 !text-sm">
            Connect a Source
          </button>
        </motion.div>
      </section>

      {/* Stat strip — one live sentence about the lake, not four boxed cards. */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.6, ease: EASE }}
        className="py-12 mb-20"
        style={{ borderTop: '1px solid var(--hairline)', borderBottom: '1px solid var(--hairline)' }}
      >
        <div className="grid grid-cols-2 lg:grid-cols-4">
          {stats.map((s, i) => (
            <div key={s.label} className="text-center px-4" style={{ borderLeft: i === 0 ? 'none' : '1px solid var(--hairline)' }}>
              <p className="font-display font-semibold" style={{ fontSize: 38, letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>
                <AnimatedNumber value={s.value} />
              </p>
              <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </motion.section>

      {isEmpty ? (
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <p className="bh-label mb-4 text-center">Get started</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-4xl mx-auto">
            <GuideCard icon={Plug} step="01" title="Connect a source" description="A SQLite file, Postgres database, or REST API." onClick={() => navigate('/sources')} />
            <GuideCard icon={Workflow} step="02" title="Build a pipeline" description="Land raw records into a bronze table." onClick={() => navigate('/pipelines')} />
            <GuideCard icon={LayoutDashboard} step="03" title="Design a dashboard" description="Animated, drag-and-drop, fully yours." onClick={() => navigate('/dashboards')} />
          </div>
        </motion.section>
      ) : (
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <div className="flex items-center justify-between mb-4 max-w-4xl mx-auto">
            <p className="bh-label">Your dashboards</p>
            <button onClick={() => navigate('/dashboards')} className="text-xs" style={{ color: 'var(--accent-ink)' }}>
              View all
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-4xl mx-auto">
            {dashboards.slice(0, 3).map((d, i) => (
              <motion.button
                key={d.id}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.4, ease: EASE }}
                whileHover={{ y: -3 }}
                onClick={() => navigate(`/dashboards/${d.id}`)}
                className="text-left bh-card bh-no-rise p-6"
              >
                <LayoutDashboard size={17} style={{ color: 'var(--accent-ink)' }} className="mb-4" strokeWidth={1.7} />
                <p className="font-medium text-[15px]" style={{ color: 'var(--text-primary)' }}>
                  {d.name}
                </p>
                {d.description && (
                  <p className="text-[13px] mt-1.5 line-clamp-2" style={{ color: 'var(--text-tertiary)' }}>
                    {d.description}
                  </p>
                )}
              </motion.button>
            ))}
          </div>
        </motion.section>
      )}
    </div>
  )
}

function GuideCard({ icon: Icon, step, title, description, onClick }) {
  return (
    <motion.button whileHover={{ y: -3 }} onClick={onClick} className="text-left bh-card bh-no-rise p-6">
      <div className="flex items-center justify-between mb-5">
        <Icon size={18} style={{ color: 'var(--accent-ink)' }} strokeWidth={1.7} />
        <span className="font-mono-num text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          {step}
        </span>
      </div>
      <p className="font-medium text-[15px]" style={{ color: 'var(--text-primary)' }}>
        {title}
      </p>
      <p className="text-[13px] mt-1.5" style={{ color: 'var(--text-tertiary)' }}>
        {description}
      </p>
    </motion.button>
  )
}
