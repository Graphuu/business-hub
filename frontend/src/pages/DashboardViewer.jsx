import { motion } from 'framer-motion'
import { ArrowLeft, Pencil, Plus, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { deleteWidget, getDashboardData, updateLayout } from '../api/businessHub'
import DashboardGrid from '../components/DashboardGrid'
import { useToast } from '../components/Toast'
import WidgetEditorModal from '../components/WidgetEditorModal'

export default function DashboardViewer() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const [dashboard, setDashboard] = useState(null)
  const [widgets, setWidgets] = useState([])
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [editorState, setEditorState] = useState(null)

  const load = () => {
    setLoading(true)
    getDashboardData(id)
      .then((d) => {
        setDashboard(d.dashboard)
        setWidgets(d.widgets)
      })
      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [id])

  const handleLayoutSettled = async (layout) => {
    const items = layout.map((l) => ({ id: l.i, x: l.x, y: l.y, w: l.w, h: l.h }))
    setWidgets((cur) =>
      cur.map((w) => {
        const match = items.find((it) => it.id === w.id)
        return match ? { ...w, layout: { x: match.x, y: match.y, w: match.w, h: match.h } } : w
      })
    )
    try {
      await updateLayout(id, items)
    } catch {
      toast.error('Failed to save layout')
    }
  }

  const openAddWidget = () => {
    const maxY = widgets.reduce((m, w) => Math.max(m, (w.layout.y || 0) + (w.layout.h || 0)), 0)
    setEditorState({ widget: null, nextPosition: { x: 0, y: maxY, w: 6, h: 5 } })
  }

  const openEditWidget = (w) => setEditorState({ widget: w, nextPosition: null })

  const removeWidget = async (w) => {
    if (!window.confirm(`Remove widget "${w.title}"?`)) return
    try {
      await deleteWidget(id, w.id)
      setWidgets((cur) => cur.filter((x) => x.id !== w.id))
      toast.success('Widget removed')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Delete failed')
    }
  }

  if (loading || !dashboard) {
    return (
      <div className="space-y-3">
        <div className="h-10 w-64 rounded-lg animate-pulse" style={{ background: 'var(--surface)' }} />
        <div className="h-96 rounded-2xl animate-pulse" style={{ background: 'var(--surface)' }} />
      </div>
    )
  }

  return (
    <div>
      <button onClick={() => navigate('/dashboards')} className="flex items-center gap-1.5 text-xs mb-5" style={{ color: 'var(--text-tertiary)' }}>
        <ArrowLeft size={13} /> All dashboards
      </button>

      <div className="flex items-end justify-between gap-4 mb-9 flex-wrap">
        <div>
          <span className="bh-label bh-eyebrow mb-2.5" style={{ color: 'var(--accent-ink)' }}>
            Business Hub — Dashboard
          </span>
          <h1 className="text-[34px] font-semibold font-display leading-none" style={{ color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>
            {dashboard.name}
          </h1>
        </div>
        <div className="flex items-center gap-2 pb-1">
          {editMode && (
            <button onClick={openAddWidget} className="bh-btn-ghost flex items-center gap-2">
              <Plus size={13} /> Add Widget
            </button>
          )}
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => setEditMode((v) => !v)}
            className="flex items-center gap-2 text-[13px] font-medium px-4 py-2 rounded-lg"
            style={{
              background: editMode ? 'var(--accent)' : 'var(--fill-3)',
              color: editMode ? 'var(--on-accent)' : 'var(--text-primary)',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
          >
            {editMode ? <X size={13} /> : <Pencil size={13} />}
            {editMode ? 'Done Editing' : 'Edit Dashboard'}
          </motion.button>
        </div>
      </div>

      {widgets.length === 0 ? (
        <div className="text-center py-24" style={{ color: 'var(--text-tertiary)' }}>
          <Sparkles size={28} className="mx-auto mb-3 opacity-30" />
          <p className="mb-3 text-sm">This dashboard has no widgets yet.</p>
          <button onClick={editMode ? openAddWidget : () => setEditMode(true)} className="text-sm" style={{ color: 'var(--accent-ink)' }}>
            {editMode ? 'Add your first widget' : 'Enter edit mode to add one'}
          </button>
        </div>
      ) : (
        <DashboardGrid
          widgets={widgets}
          editMode={editMode}
          onLayoutSettled={handleLayoutSettled}
          onEditWidget={openEditWidget}
          onDeleteWidget={removeWidget}
        />
      )}

      {editorState && (
        <WidgetEditorModal
          dashboardId={id}
          widget={editorState.widget}
          nextPosition={editorState.nextPosition}
          onClose={() => setEditorState(null)}
          onSaved={() => {
            setEditorState(null)
            load()
          }}
        />
      )}
    </div>
  )
}
