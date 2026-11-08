import { ArrowLeft, Copy, Plus, Radio, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createPipeline, getPipeline, listIntegrations, updatePipeline } from '../api/businessHub'
import { Field, Input, Select, TextArea } from '../components/FormFields'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/Toast'

const PAGINATION_MODES = [
  { value: 'none', label: 'None — single request' },
  { value: 'page_param', label: 'Page number parameter' },
  { value: 'cursor_param', label: 'Cursor parameter' },
]

const STREAMING_TYPES = ['aws_sqs', 'gcp_pubsub']

function FieldMappingEditor({ fieldMapping, onUpdate, onAdd, onRemove }) {
  return (
    <div>
      <p className="bh-label mb-2">Field Mapping</p>
      <div className="space-y-2">
        {fieldMapping.map((row, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input value={row.source} onChange={(v) => onUpdate(idx, 'source', v)} placeholder="source path (e.g. address.city)" />
            <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>→</span>
            <Input value={row.target} onChange={(v) => onUpdate(idx, 'target', v)} placeholder="column name" />
            <button onClick={() => onRemove(idx)} className="p-1.5 flex-shrink-0">
              <Trash2 size={13} style={{ color: 'var(--text-tertiary)' }} />
            </button>
          </div>
        ))}
      </div>
      <button onClick={onAdd} className="flex items-center gap-1.5 text-xs mt-2" style={{ color: 'var(--accent-ink)' }}>
        <Plus size={12} /> Add field
      </button>
      <p className="text-[11px] mt-2" style={{ color: 'var(--text-tertiary)' }}>
        Leave empty to keep every field from the source record as-is.
      </p>
    </div>
  )
}

export default function PipelineBuilder() {
  const { id } = useParams()
  const editing = !!id
  const navigate = useNavigate()
  const toast = useToast()

  const [integrations, setIntegrations] = useState([])
  const [loading, setLoading] = useState(editing)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [integrationId, setIntegrationId] = useState('')
  const [targetTable, setTargetTable] = useState('')
  const [query, setQuery] = useState('SELECT * FROM my_table')
  const [method, setMethod] = useState('GET')
  const [endpointPath, setEndpointPath] = useState('/')
  const [requestBody, setRequestBody] = useState('')
  const [rootPath, setRootPath] = useState('')
  const [fieldMapping, setFieldMapping] = useState([{ source: '', target: '' }])
  const [paginationMode, setPaginationMode] = useState('none')
  const [paginationParam, setPaginationParam] = useState('page')

  useEffect(() => {
    listIntegrations().then(setIntegrations)
  }, [])

  useEffect(() => {
    if (!editing) return
    getPipeline(id).then((p) => {
      setName(p.name)
      setIntegrationId(p.integration_id)
      setTargetTable(p.target_table)
      const sc = p.source_config || {}
      if (sc.query) setQuery(sc.query)
      if (sc.method) setMethod(sc.method)
      if (sc.endpoint_path) setEndpointPath(sc.endpoint_path)
      if (sc.request_body) setRequestBody(JSON.stringify(sc.request_body, null, 2))
      if (sc.root_path) setRootPath(sc.root_path)
      if (sc.field_mapping?.length) setFieldMapping(sc.field_mapping)
      if (sc.pagination?.mode) setPaginationMode(sc.pagination.mode)
      if (sc.pagination?.param_name) setPaginationParam(sc.pagination.param_name)
      setLoading(false)
    })
  }, [id, editing])

  const selectedIntegration = integrations.find((i) => i.id === integrationId)
  const sourceType = selectedIntegration?.type
  const isStreaming = STREAMING_TYPES.includes(sourceType)
  const isWebhook = sourceType === 'webhook'
  const isQueryBased = sourceType && !['api', 'webhook', ...STREAMING_TYPES].includes(sourceType)

  const updateMappingRow = (idx, key, value) => setFieldMapping((rows) => rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)))
  const addMappingRow = () => setFieldMapping((rows) => [...rows, { source: '', target: '' }])
  const removeMappingRow = (idx) => setFieldMapping((rows) => rows.filter((_, i) => i !== idx))

  const buildSourceConfig = () => {
    if (sourceType === 'api') {
      let parsedBody = null
      if (method === 'POST' && requestBody.trim()) {
        try {
          parsedBody = JSON.parse(requestBody)
        } catch {
          throw new Error('Request body must be valid JSON')
        }
      }
      return {
        method,
        endpoint_path: endpointPath,
        request_body: parsedBody,
        root_path: rootPath,
        field_mapping: fieldMapping.filter((r) => r.source && r.target),
        pagination: paginationMode === 'none' ? { mode: 'none' } : { mode: paginationMode, param_name: paginationParam },
      }
    }
    if (isWebhook || isStreaming) {
      return { field_mapping: fieldMapping.filter((r) => r.source && r.target) }
    }
    return { query }
  }

  const save = async () => {
    if (!name.trim() || !integrationId || !targetTable.trim()) {
      toast.error('Name, data source, and target table are required')
      return
    }
    setSaving(true)
    try {
      const sourceConfig = buildSourceConfig()
      const body = { name, integration_id: integrationId, target_table: targetTable, source_config: sourceConfig }
      if (editing) {
        await updatePipeline(id, body)
        toast.success('Pipeline saved')
        navigate('/pipelines')
      } else {
        const created = await createPipeline(body)
        toast.success('Pipeline created')
        // Webhook/streaming pipelines have nothing to "run" — land back
        // on the builder so the endpoint URL / stream controls are visible.
        navigate(isWebhook || isStreaming ? `/pipelines/${created.id}` : '/pipelines')
      }
    } catch (e) {
      toast.error(e.message || e.response?.data?.detail || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="h-40 rounded-2xl animate-pulse" style={{ background: 'var(--surface)' }} />

  const webhookUrl = editing ? `${window.location.origin}/api/ingest/webhook/${id}` : null

  return (
    <div className="max-w-2xl">
      <button onClick={() => navigate('/pipelines')} className="flex items-center gap-1.5 text-xs mb-5" style={{ color: 'var(--text-tertiary)' }}>
        <ArrowLeft size={13} /> Back to pipelines
      </button>

      <PageHeader eyebrow="Business Hub" title={editing ? 'Edit Pipeline' : 'New Ingestion Pipeline'} />

      <div className="space-y-4">
        <Field label="Name *">
          <Input value={name} onChange={setName} placeholder="Ingest Orders (Bronze)" />
        </Field>

        <Field label="Data Source *">
          <Select
            value={integrationId}
            onChange={setIntegrationId}
            options={[{ value: '', label: 'Select a data source…' }, ...integrations.map((i) => ({ value: i.id, label: `${i.name} (${i.type})` }))]}
          />
        </Field>

        <Field label="Target table (bronze) *" hint="Letters, digits, underscore — no spaces">
          <Input value={targetTable} onChange={setTargetTable} placeholder="bronze_orders" />
        </Field>

        {sourceType === 'api' && (
          <div className="rounded-2xl p-4 space-y-4" style={{ background: 'var(--fill-2)' }}>
            <div className="grid grid-cols-[120px_1fr] gap-3">
              <Field label="Method">
                <Select value={method} onChange={setMethod} options={[{ value: 'GET', label: 'GET' }, { value: 'POST', label: 'POST' }]} />
              </Field>
              <Field label="Endpoint path" hint="Appended to the integration's base URL">
                <Input value={endpointPath} onChange={setEndpointPath} placeholder="/users" />
              </Field>
            </div>
            {method === 'POST' && (
              <Field label="Request body (JSON, optional)" hint="Sent as the POST body — useful for GraphQL-style or search-query APIs">
                <TextArea value={requestBody} onChange={setRequestBody} rows={4} mono placeholder='{"query": "..."}' />
              </Field>
            )}
            <Field label="Root path (optional)" hint="Dotted path to the array of records in the response — leave empty if the response is a bare array">
              <Input value={rootPath} onChange={setRootPath} placeholder="data.items" />
            </Field>
            <Field label="Pagination">
              <Select value={paginationMode} onChange={setPaginationMode} options={PAGINATION_MODES} />
            </Field>
            {paginationMode !== 'none' && (
              <Field label="Pagination parameter name">
                <Input value={paginationParam} onChange={setPaginationParam} placeholder={paginationMode === 'page_param' ? 'page' : 'cursor'} />
              </Field>
            )}
            <FieldMappingEditor fieldMapping={fieldMapping} onUpdate={updateMappingRow} onAdd={addMappingRow} onRemove={removeMappingRow} />
          </div>
        )}

        {isQueryBased && (
          <Field label="Source query *" hint={`Runs against the ${sourceType} source directly`}>
            <TextArea value={query} onChange={setQuery} rows={5} mono />
          </Field>
        )}

        {isWebhook && (
          <div className="rounded-2xl p-4 space-y-4" style={{ background: 'var(--fill-2)' }}>
            {webhookUrl ? (
              <div>
                <p className="bh-label mb-1.5">Endpoint URL</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs px-3 py-2 rounded-lg truncate" style={{ background: 'var(--fill-2)', color: 'var(--accent-ink)' }}>
                    {webhookUrl}
                  </code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success('Copied') }}
                    className="p-2 rounded-lg hover:bg-ink/5 flex-shrink-0"
                  >
                    <Copy size={13} style={{ color: 'var(--text-tertiary)' }} />
                  </button>
                </div>
                <p className="text-[11px] mt-2" style={{ color: 'var(--text-tertiary)' }}>
                  POST a JSON object (or array of objects) here with header <code className="font-mono-num">X-Webhook-Secret</code> set to the value configured on the data source. Every call appends — it never overwrites what's already in the table.
                </p>
              </div>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Save this pipeline to generate its endpoint URL.
              </p>
            )}
            <FieldMappingEditor fieldMapping={fieldMapping} onUpdate={updateMappingRow} onAdd={addMappingRow} onRemove={removeMappingRow} />
          </div>
        )}

        {isStreaming && (
          <div className="rounded-2xl p-4 space-y-4" style={{ background: 'var(--fill-2)' }}>
            <div className="flex items-start gap-2.5">
              <Radio size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent-ink)' }} />
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                This pipeline streams continuously in the background once started — each message is appended to the
                table as it arrives. Start and stop it from the pipelines list{editing ? '' : ' after saving'}.
              </p>
            </div>
            <FieldMappingEditor fieldMapping={fieldMapping} onUpdate={updateMappingRow} onAdd={addMappingRow} onRemove={removeMappingRow} />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={() => navigate('/pipelines')} className="bh-btn-ghost">
            Cancel
          </button>
          <button onClick={save} disabled={saving} className="bh-btn-primary">
            {saving ? 'Saving…' : 'Save Pipeline'}
          </button>
        </div>
      </div>
    </div>
  )
}
