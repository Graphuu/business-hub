import { motion } from 'framer-motion'
import { LayoutDashboard, Plus, Wand2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createDashboard, listDashboards } from '../api/businessHub'
import EmptyState from '../components/EmptyState'
import { Field, Input } from '../components/FormFields'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/Toast'

export default function Dashboards() {
  const toast = useToast()
  const navigate = useNavigate()
  const [dashboards, setDashboards] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  const load = () => {
    setLoading(true)
    listDashboards()
      .then(setDashboards)
      .catch(() => toast.error('Failed to load dashboards'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  return (
    <div>
      <PageHeader
        icon={LayoutDashboard}
        eyebrow="Business Hub"
        title="Dashboards"
        description="Animated, fully editable canvases built on saved queries."
        actions={
          <>
            <button onClick={() => navigate('/ai')} className="bh-btn-ghost flex items-center gap-2">
              <Wand2 size={13} /> Generate with AI
            </button>
            <button onClick={() => setShowCreate(true)} className="bh-btn-primary flex items-center gap-2">
              <Plus size={13} /> New Dashboard
            </button>
          </>
        }
      />

      {loading ? (
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-2xl animate-pulse" style={{ background: 'var(--surface)' }} />
          ))}
        </div>
      ) : dashboards.length === 0 ? (
        <EmptyState
          icon={LayoutDashboard}
          title="No dashboards yet."
          action={
            <button onClick={() => setShowCreate(true)} className="text-sm" style={{ color: 'var(--accent-ink)' }}>
              Build your first dashboard
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {dashboards.map((d, i) => (
            <motion.button
              key={d.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              whileHover={{ y: -3 }}
              onClick={() => navigate(`/dashboards/${d.id}`)}
              className="text-left bh-card p-5"
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                style={{ background: 'var(--accent-soft)' }}
              >
                <LayoutDashboard size={15} style={{ color: 'var(--accent-ink)' }} strokeWidth={1.8} />
              </div>
              <p className="font-semibold text-sm font-display" style={{ color: 'var(--text-primary)' }}>
                {d.name}
              </p>
              {d.description && (
                <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--text-tertiary)' }}>
                  {d.description}
                </p>
              )}
            </motion.button>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Dashboard">
        <CreateDashboardForm onClose={() => setShowCreate(false)} onCreated={(d) => navigate(`/dashboards/${d.id}`)} />
      </Modal>
    </div>
  )
}

function CreateDashboardForm({ onClose, onCreated }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const create = async () => {
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }
    setSaving(true)
    try {
      const d = await createDashboard({ name, description })
      onCreated(d)
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <Field label="Name *">
        <Input value={name} onChange={setName} placeholder="Executive Overview" />
      </Field>
      <Field label="Description">
        <Input value={description} onChange={setDescription} placeholder="What this dashboard is for" />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onClose} className="bh-btn-ghost">
          Cancel
        </button>
        <button onClick={create} disabled={saving} className="bh-btn-primary">
          {saving ? 'Creating…' : 'Create'}
        </button>
      </div>
    </div>
  )
}
