import { motion } from 'framer-motion'
import { CheckCircle2, ExternalLink, Plus, Radio, RefreshCw, Square, Trash2, Workflow, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  deletePipeline, getPipelineStreamStatus, listIntegrations, listPipelines,
  runPipeline, startPipelineStream, stopPipelineStream,
} from '../api/businessHub'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/Toast'

const STREAMING_TYPES = ['aws_sqs', 'gcp_pubsub']

const STATUS_STYLE = {
  active: { background: 'rgba(63,174,138,.14)', color: 'var(--success)' },
  draft: { background: 'var(--fill-2)', color: 'var(--text-secondary)' },
  paused: { background: 'rgba(251,191,36,.14)', color: 'var(--warning)' },
}

export default function Pipelines() {
  const toast = useToast()
  const navigate = useNavigate()
  const [pipelines, setPipelines] = useState([])
  const [integrationsById, setIntegrationsById] = useState({})
  const [streamStatus, setStreamStatus] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)

  const load = () => {
    setLoading(true)
    Promise.all([listPipelines(), listIntegrations()])
      .then(([p, integs]) => {
        setPipelines(p)
        setIntegrationsById(Object.fromEntries(integs.map((i) => [i.id, i])))
        const streaming = p.filter((x) => STREAMING_TYPES.includes(integs.find((i) => i.id === x.integration_id)?.type))
        Promise.all(streaming.map((x) => getPipelineStreamStatus(x.id).then((s) => [x.id, s.running]).catch(() => [x.id, false]))).then((entries) =>
          setStreamStatus(Object.fromEntries(entries))
        )
      })
      .catch(() => toast.error('Failed to load pipelines'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const run = async (p) => {
    setBusy(p.id)
    try {
      await runPipeline(p.id)
      toast.success(`${p.name} ran successfully`)
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Run failed')
      load()
    } finally {
      setBusy(null)
    }
  }

  const toggleStream = async (p, running) => {
    setBusy(p.id)
    try {
      if (running) {
        await stopPipelineStream(p.id)
        toast.success(`${p.name} stopped`)
      } else {
        await startPipelineStream(p.id)
        toast.success(`${p.name} streaming`)
      }
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  const del = async (p) => {
    if (!window.confirm(`Delete pipeline "${p.name}"?`)) return
    try {
      await deletePipeline(p.id)
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Delete failed')
    }
  }

  const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : '—')

  return (
    <div>
      <PageHeader
        eyebrow="Business Hub"
        title="Ingestion Pipelines"
        description="Pull from a source on demand, receive pushed events at a webhook, or stream continuously from a queue."
        actions={
          <button onClick={() => navigate('/pipelines/new')} className="bh-btn-primary flex items-center gap-2">
            <Plus size={13} /> New Pipeline
          </button>
        }
      />

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-[72px] rounded-2xl animate-pulse" style={{ background: 'var(--surface)' }} />
          ))}
        </div>
      ) : pipelines.length === 0 ? (
        <EmptyState
          icon={Workflow}
          title="No ingestion pipelines yet."
          action={
            <button onClick={() => navigate('/pipelines/new')} className="text-sm" style={{ color: 'var(--accent-ink)' }}>
              Create your first pipeline
            </button>
          }
        />
      ) : (
        <div className="space-y-2">
          {pipelines.map((p, i) => {
            const itype = integrationsById[p.integration_id]?.type
            const isStreaming = STREAMING_TYPES.includes(itype)
            const isWebhook = itype === 'webhook'
            const running = streamStatus[p.id]

            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center justify-between px-5 py-4 rounded-2xl bh-card cursor-pointer"
                onClick={() => navigate(`/pipelines/${p.id}`)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                      {p.name}
                    </p>
                    <span className="text-[10.5px] px-2 py-0.5 rounded-[3px] font-medium uppercase tracking-wide" style={STATUS_STYLE[p.status] || STATUS_STYLE.draft}>
                      {p.status}
                    </span>
                    {isStreaming && running && (
                      <span className="flex items-center gap-1 text-[10.5px]" style={{ color: 'var(--success)' }}>
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--success)' }} /> live
                      </span>
                    )}
                    {!isStreaming && p.last_run_status === 'success' && <CheckCircle2 size={12} style={{ color: 'var(--success)' }} />}
                    {!isStreaming && p.last_run_status === 'failed' && <XCircle size={12} style={{ color: 'var(--danger)' }} />}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    → {p.target_table} · last {isWebhook || isStreaming ? 'received' : 'run'} {fmt(p.last_run_at)}
                    {p.last_error && <span style={{ color: 'var(--danger)' }}> · {p.last_error}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  {isStreaming ? (
                    <button
                      onClick={() => toggleStream(p, running)}
                      disabled={busy === p.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg disabled:opacity-50"
                      style={{ background: running ? 'rgba(255,69,58,.12)' : 'rgba(63,174,138,.14)', color: running ? 'var(--danger)' : 'var(--success)' }}
                    >
                      {running ? <Square size={11} /> : <Radio size={11} />} {running ? 'Stop' : 'Start'}
                    </button>
                  ) : isWebhook ? (
                    <button
                      onClick={() => navigate(`/pipelines/${p.id}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg"
                      style={{ background: 'var(--fill-2)', color: 'var(--text-primary)' }}
                    >
                      <ExternalLink size={11} /> Endpoint
                    </button>
                  ) : (
                    <button
                      onClick={() => run(p)}
                      disabled={busy === p.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg disabled:opacity-50"
                      style={{ background: 'var(--fill-2)', color: 'var(--text-primary)' }}
                    >
                      <RefreshCw size={11} className={busy === p.id ? 'animate-spin' : ''} /> Run Now
                    </button>
                  )}
                  <button onClick={() => del(p)} className="p-1.5 rounded-lg hover:bg-ink/5" title="Delete">
                    <Trash2 size={13} style={{ color: 'var(--text-tertiary)' }} />
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
