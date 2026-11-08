import { ArrowLeft, GitBranch, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createTransform, getTransform, previewTransform, updateTransform } from '../api/businessHub'
import { Field, Input, Select, TextArea } from '../components/FormFields'
import PageHeader from '../components/PageHeader'
import ResultsTable from '../components/ResultsTable'
import { useToast } from '../components/Toast'

export default function TransformBuilder() {
  const { id } = useParams()
  const editing = !!id
  const navigate = useNavigate()
  const toast = useToast()

  const [loading, setLoading] = useState(editing)
  const [saving, setSaving] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState(null)
  const [previewError, setPreviewError] = useState('')

  const [name, setName] = useState('')
  const [targetLayer, setTargetLayer] = useState('silver')
  const [targetTable, setTargetTable] = useState('')
  const [sqlText, setSqlText] = useState('SELECT * FROM bronze_orders')

  useEffect(() => {
    if (!editing) return
    getTransform(id).then((t) => {
      setName(t.name)
      setTargetLayer(t.target_layer)
      setTargetTable(t.target_table)
      setSqlText(t.sql_text)
      setLoading(false)
    })
  }, [id, editing])

  const runPreview = async () => {
    setPreviewing(true)
    setPreviewError('')
    try {
      const result = await previewTransform(sqlText)
      setPreview(result)
    } catch (e) {
      setPreviewError(e.response?.data?.detail || 'Preview failed')
      setPreview(null)
    } finally {
      setPreviewing(false)
    }
  }

  const save = async () => {
    if (!name.trim() || !targetTable.trim() || !sqlText.trim()) {
      toast.error('Name, target table, and SQL are required')
      return
    }
    setSaving(true)
    try {
      const body = { name, sql_text: sqlText, target_layer: targetLayer, target_table: targetTable }
      if (editing) {
        await updateTransform(id, body)
        toast.success('Transform saved')
      } else {
        await createTransform(body)
        toast.success('Transform created')
      }
      navigate('/transforms')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="h-40 rounded-2xl animate-pulse" style={{ background: 'var(--surface)' }} />

  return (
    <div className="max-w-4xl">
      <button onClick={() => navigate('/transforms')} className="flex items-center gap-1.5 text-xs mb-5" style={{ color: 'var(--text-tertiary)' }}>
        <ArrowLeft size={13} /> Back to transforms
      </button>

      <PageHeader icon={GitBranch} eyebrow="Business Hub" title={editing ? 'Edit Transform' : 'New Transform'} />

      <div className="grid grid-cols-2 gap-4 mb-4">
        <Field label="Name *">
          <Input value={name} onChange={setName} placeholder="Clean Orders (Silver)" />
        </Field>
        <Field label="Target layer">
          <Select
            value={targetLayer}
            onChange={setTargetLayer}
            options={[
              { value: 'silver', label: 'Silver' },
              { value: 'gold', label: 'Gold' },
            ]}
          />
        </Field>
      </div>

      <div className="mb-4">
        <Field label="Target table *" hint="Letters, digits, underscore — no spaces">
          <Input value={targetTable} onChange={setTargetTable} placeholder="silver_orders" />
        </Field>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <p className="bh-label">SQL (SELECT only — validated before every run)</p>
          <button onClick={runPreview} disabled={previewing} className="bh-btn-ghost flex items-center gap-1.5 text-xs py-1 px-2.5">
            <Play size={11} className={previewing ? 'animate-pulse' : ''} /> {previewing ? 'Running…' : 'Preview'}
          </button>
        </div>
        <TextArea value={sqlText} onChange={setSqlText} rows={9} mono />
      </div>

      {previewError && (
        <p className="text-xs mb-4 px-3 py-2 rounded-lg" style={{ color: 'var(--danger)', background: 'rgba(240,101,75,0.08)' }}>
          {previewError}
        </p>
      )}

      {preview && (
        <div className="mb-6 bh-card p-4">
          <p className="bh-label mb-2">Preview — {preview.row_count} row{preview.row_count === 1 ? '' : 's'}</p>
          <ResultsTable data={preview} />
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button onClick={() => navigate('/transforms')} className="bh-btn-ghost">
          Cancel
        </button>
        <button onClick={save} disabled={saving} className="bh-btn-primary">
          {saving ? 'Saving…' : 'Save Transform'}
        </button>
      </div>
    </div>
  )
}
