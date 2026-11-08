import { motion } from 'framer-motion'
import { CheckCircle2, Loader2, Pencil, Plug, Plus, Trash2, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  createIntegration, deleteIntegration, listIntegrations, listPipelines,
  testIntegration, testIntegrationConfig, updateIntegration,
} from '../api/businessHub'
import EmptyState from '../components/EmptyState'
import { Field, Input, Select } from '../components/FormFields'
import IntegrationConfigFields, { configSummary, DEFAULT_CONFIG, TYPE_META, TYPE_OPTIONS } from '../components/IntegrationConfigFields'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/Toast'

export default function DataSources() {
  const toast = useToast()
  const [sources, setSources] = useState([])
  const [pipelines, setPipelines] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [showCreate, setShowCreate] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([listIntegrations(), listPipelines()])
      .then(([s, p]) => {
        setSources(s)
        setPipelines(p)
      })
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const usageCount = (id) => pipelines.filter((p) => p.integration_id === id).length

  const del = async (src) => {
    if (usageCount(src.id) > 0) {
      toast.error('Cannot delete — used by an ingestion pipeline. Delete or repoint the pipeline first.')
      return
    }
    if (!window.confirm(`Delete data source "${src.name}"?`)) return
    try {
      await deleteIntegration(src.id)
      load()
      toast.success('Data source deleted')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Delete failed')
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Business Hub"
        title="Data Sources"
        description="Databases, warehouses, APIs, and streams an ingestion pipeline can pull — or receive — data from."
        actions={
          <button onClick={() => setShowCreate(true)} className="bh-btn-primary flex items-center gap-2">
            <Plus size={13} /> New Data Source
          </button>
        }
      />

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[72px] rounded-2xl animate-pulse" style={{ background: 'var(--surface)' }} />
          ))}
        </div>
      ) : sources.length === 0 ? (
        <EmptyState
          icon={Plug}
          title="No data sources yet."
          action={
            <button onClick={() => setShowCreate(true)} className="text-sm" style={{ color: 'var(--accent-ink)' }}>
              Connect your first source
            </button>
          }
        />
      ) : (
        <div className="space-y-2">
          {sources.map((src, i) => {
            const meta = TYPE_META[src.type] || TYPE_META.api
            const Icon = meta.icon
            return (
              <motion.div
                key={src.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center justify-between px-5 py-4 rounded-2xl bh-card"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: `${meta.color}1c` }}
                  >
                    <Icon size={15} style={{ color: meta.color }} strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                      {src.name}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                      {meta.label} · {configSummary(src)}
                      <span className="ml-2 opacity-80">
                        · used by {usageCount(src.id)} pipeline{usageCount(src.id) === 1 ? '' : 's'}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => setEditing(src)} className="p-1.5 rounded-lg hover:bg-ink/5" title="Edit">
                    <Pencil size={13} style={{ color: 'var(--text-tertiary)' }} />
                  </button>
                  <button onClick={() => del(src)} className="p-1.5 rounded-lg hover:bg-ink/5" title="Delete">
                    <Trash2 size={13} style={{ color: 'var(--text-tertiary)' }} />
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {(showCreate || editing) && (
        <IntegrationModal
          source={editing}
          onClose={() => {
            setShowCreate(false)
            setEditing(null)
          }}
          onSaved={() => {
            setShowCreate(false)
            setEditing(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function IntegrationModal({ source, onClose, onSaved }) {
  const toast = useToast()
  const editing = !!source
  const [name, setName] = useState(source?.name || '')
  const [type, setType] = useState(source?.type || 'sqlite')
  const [config, setConfig] = useState(source?.config || DEFAULT_CONFIG.sqlite)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [err, setErr] = useState('')

  const setType_ = (t) => {
    setType(t)
    setConfig(DEFAULT_CONFIG[t])
    setTestResult(null)
  }

  const test = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = editing ? await testIntegration(source.id) : await testIntegrationConfig({ name: name || 'test', type, config })
      setTestResult(result)
    } catch (e) {
      setTestResult({ status: 'error', message: e.response?.data?.detail || 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  const save = async () => {
    if (!name.trim()) {
      setErr('Name is required')
      return
    }
    setErr('')
    setSaving(true)
    try {
      if (editing) {
        await updateIntegration(source.id, { name, type, config })
        toast.success('Data source saved')
      } else {
        await createIntegration({ name, type, config })
        toast.success('Data source created')
      }
      onSaved()
    } catch (e) {
      setErr(e.response?.data?.detail || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={editing ? `Edit — ${source.name}` : 'New Data Source'} width={620}>
      <div className="space-y-4">
        <Field label="Name *">
          <Input value={name} onChange={setName} placeholder="Production Orders DB" />
        </Field>

        <Field label="Type">
          <Select value={type} onChange={setType_} options={TYPE_OPTIONS} />
        </Field>

        <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--fill-2)' }}>
          <IntegrationConfigFields type={type} config={config} onChange={setConfig} />
        </div>

        <div className="flex items-center gap-3">
          <button onClick={test} disabled={testing} className="bh-btn-ghost flex items-center gap-2 text-xs">
            {testing ? <Loader2 size={12} className="animate-spin" /> : null} Test Connection
          </button>
          {testResult && (
            <span
              className="text-xs flex items-center gap-1"
              style={{ color: testResult.status === 'ok' ? 'var(--success)' : 'var(--danger)' }}
            >
              {testResult.status === 'ok' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
              {testResult.message}
            </span>
          )}
        </div>

        {err && (
          <p className="text-xs" style={{ color: 'var(--danger)' }}>
            {err}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="bh-btn-ghost">
            Cancel
          </button>
          <button onClick={save} disabled={saving} className="bh-btn-primary">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
