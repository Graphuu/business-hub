import { useEffect, useState } from 'react'
import { createWidget, listSavedQueries, runSavedQuery, updateWidget } from '../api/businessHub'
import { Field, Input, Select } from './FormFields'
import Modal from './Modal'
import { useToast } from './Toast'

const WIDGET_TYPES = [
  { value: 'bar', label: 'Bar chart' },
  { value: 'line', label: 'Line chart' },
  { value: 'area', label: 'Area chart' },
  { value: 'pie', label: 'Pie chart' },
  { value: 'kpi', label: 'KPI number' },
  { value: 'table', label: 'Table' },
]

const FORMATS = [
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'percent', label: 'Percent' },
]

export default function WidgetEditorModal({ dashboardId, widget, nextPosition, onClose, onSaved }) {
  const toast = useToast()
  const editing = !!widget
  const [savedQueries, setSavedQueries] = useState([])
  const [savedQueryId, setSavedQueryId] = useState(widget?.saved_query_id || '')
  const [widgetType, setWidgetType] = useState(widget?.widget_type || 'bar')
  const [title, setTitle] = useState(widget?.title || '')
  const [spec, setSpec] = useState(widget?.spec || {})
  const [columns, setColumns] = useState([])
  const [sampleRow, setSampleRow] = useState(null)
  const [loadingCols, setLoadingCols] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listSavedQueries().then(setSavedQueries)
  }, [])

  useEffect(() => {
    if (!savedQueryId) return
    setLoadingCols(true)
    runSavedQuery(savedQueryId)
      .then((r) => {
        setColumns(r.columns)
        setSampleRow(r.rows[0] || null)
      })
      .catch(() => toast.error('Failed to run saved query'))
      .finally(() => setLoadingCols(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedQueryId])

  const numericColumns = sampleRow ? columns.filter((_, i) => typeof sampleRow[i] === 'number') : []

  const onPickQuery = (qid) => {
    setSavedQueryId(qid)
    const q = savedQueries.find((s) => s.id === qid)
    if (q && !title) setTitle(q.name)
  }

  const setSpecField = (key, value) => setSpec((s) => ({ ...s, [key]: value }))

  const toggleYColumn = (col) => {
    setSpec((s) => {
      const current = s.y_columns || []
      const next = current.includes(col) ? current.filter((c) => c !== col) : [...current, col]
      return { ...s, y_columns: next }
    })
  }

  const save = async () => {
    if (!savedQueryId || !title.trim()) {
      toast.error('Title and saved query are required')
      return
    }
    setSaving(true)
    try {
      const body = {
        title,
        widget_type: widgetType,
        saved_query_id: savedQueryId,
        spec,
        layout: widget?.layout || nextPosition,
      }
      if (editing) await updateWidget(dashboardId, widget.id, body)
      else await createWidget(dashboardId, body)
      onSaved()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={editing ? 'Edit Widget' : 'Add Widget'} width={520}>
      <div className="space-y-4">
        <Field label="Saved query *">
          <Select
            value={savedQueryId}
            onChange={onPickQuery}
            options={[{ value: '', label: 'Select a saved query…' }, ...savedQueries.map((q) => ({ value: q.id, label: q.name }))]}
          />
        </Field>

        <Field label="Widget title *">
          <Input value={title} onChange={setTitle} placeholder="Revenue by Category" />
        </Field>

        <Field label="Widget type">
          <Select value={widgetType} onChange={setWidgetType} options={WIDGET_TYPES} />
        </Field>

        {savedQueryId && (
          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--fill-2)' }}>
            {loadingCols ? (
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Loading columns…
              </p>
            ) : (
              <>
                {widgetType === 'kpi' && (
                  <>
                    <Field label="Value column">
                      <Select value={spec.value_column || ''} onChange={(v) => setSpecField('value_column', v)} options={colOptions(columns)} />
                    </Field>
                    <Field label="Format">
                      <Select value={spec.format || 'number'} onChange={(v) => setSpecField('format', v)} options={FORMATS} />
                    </Field>
                  </>
                )}
                {(widgetType === 'bar' || widgetType === 'line' || widgetType === 'area') && (
                  <>
                    <Field label="X-axis column">
                      <Select value={spec.x_column || ''} onChange={(v) => setSpecField('x_column', v)} options={colOptions(columns)} />
                    </Field>
                    <div>
                      <p className="bh-label mb-1.5">Y-axis column(s)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(numericColumns.length ? numericColumns : columns).map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => toggleYColumn(c)}
                            className="text-[11px] px-2.5 py-1 rounded"
                            style={{
                              background: (spec.y_columns || []).includes(c) ? 'var(--accent-soft)' : 'var(--fill-3)',
                              color: (spec.y_columns || []).includes(c) ? 'var(--accent-ink)' : 'var(--text-secondary)',
                            }}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                {widgetType === 'pie' && (
                  <>
                    <Field label="Label column">
                      <Select value={spec.label_column || ''} onChange={(v) => setSpecField('label_column', v)} options={colOptions(columns)} />
                    </Field>
                    <Field label="Value column">
                      <Select value={spec.value_column || ''} onChange={(v) => setSpecField('value_column', v)} options={colOptions(columns)} />
                    </Field>
                  </>
                )}
                {widgetType === 'table' && (
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Shows every column from the saved query.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="bh-btn-ghost">
            Cancel
          </button>
          <button onClick={save} disabled={saving} className="bh-btn-primary">
            {saving ? 'Saving…' : 'Save Widget'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function colOptions(columns) {
  return [{ value: '', label: 'Select…' }, ...columns.map((c) => ({ value: c, label: c }))]
}
