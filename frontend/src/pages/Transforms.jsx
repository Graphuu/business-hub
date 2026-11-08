import { motion } from 'framer-motion'
import { CheckCircle2, GitBranch, Play, Plus, Trash2, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteTransform, listTransforms, runTransform } from '../api/businessHub'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/Toast'

const LAYER_STYLE = {
  silver: { background: 'rgba(79,168,232,.14)', color: 'var(--azure)' },
  gold: { background: 'rgba(217,164,65,.14)', color: 'var(--gold)' },
}

export default function Transforms() {
  const toast = useToast()
  const navigate = useNavigate()
  const [transforms, setTransforms] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)

  const load = () => {
    setLoading(true)
    listTransforms()
      .then(setTransforms)
      .catch(() => toast.error('Failed to load transforms'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const run = async (t) => {
    setBusy(t.id)
    try {
      await runTransform(t.id)
      toast.success(`${t.name} ran successfully`)
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Run failed')
      load()
    } finally {
      setBusy(null)
    }
  }

  const del = async (t) => {
    if (!window.confirm(`Delete transform "${t.name}"?`)) return
    try {
      await deleteTransform(t.id)
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Delete failed')
    }
  }

  const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : '—')

  return (
    <div>
      <PageHeader
        icon={GitBranch}
        eyebrow="Business Hub"
        title="Transforms"
        description="Validated SQL that reshapes bronze into cleaned silver and aggregated gold tables."
        actions={
          <button onClick={() => navigate('/transforms/new')} className="bh-btn-primary flex items-center gap-2">
            <Plus size={13} /> New Transform
          </button>
        }
      />

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-[72px] rounded-2xl animate-pulse" style={{ background: 'var(--surface)' }} />
          ))}
        </div>
      ) : transforms.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="No transforms yet."
          action={
            <button onClick={() => navigate('/transforms/new')} className="text-sm" style={{ color: 'var(--accent-ink)' }}>
              Create your first transform
            </button>
          }
        />
      ) : (
        <div className="space-y-2">
          {transforms.map((t, i) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="flex items-center justify-between px-5 py-4 rounded-2xl bh-card cursor-pointer"
              onClick={() => navigate(`/transforms/${t.id}`)}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                    {t.name}
                  </p>
                  <span className="text-[10.5px] px-2 py-0.5 rounded-[3px] font-medium uppercase tracking-wide" style={LAYER_STYLE[t.target_layer]}>
                    {t.target_layer}
                  </span>
                  {t.last_run_status === 'success' && <CheckCircle2 size={12} style={{ color: 'var(--success)' }} />}
                  {t.last_run_status === 'failed' && <XCircle size={12} style={{ color: 'var(--danger)' }} />}
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  → {t.target_table} · last run {fmt(t.last_run_at)}
                  {t.last_error && <span style={{ color: 'var(--danger)' }}> · {t.last_error}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => run(t)}
                  disabled={busy === t.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg disabled:opacity-50"
                  style={{ background: 'var(--fill-2)', color: 'var(--text-primary)' }}
                >
                  <Play size={11} className={busy === t.id ? 'animate-pulse' : ''} /> Run
                </button>
                <button onClick={() => del(t)} className="p-1.5 rounded-lg hover:bg-ink/5" title="Delete">
                  <Trash2 size={13} style={{ color: 'var(--text-tertiary)' }} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
