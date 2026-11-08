import { Database, Globe, Plus, Radio, Trash2, Webhook } from 'lucide-react'
import { useState } from 'react'
import { Checkbox, Field, Input, Select, TextArea } from './FormFields'

export const TYPE_META = {
  sqlite: { label: 'SQLite', icon: Database, color: '#4FA8E8', family: 'Database' },
  postgresql: { label: 'PostgreSQL', icon: Database, color: '#3FAE8A', family: 'Database' },
  bigquery: { label: 'BigQuery', icon: Database, color: '#4285F4', family: 'Database' },
  athena: { label: 'AWS Athena', icon: Database, color: '#FF9900', family: 'Database' },
  api: { label: 'REST API', icon: Globe, color: '#D9A441', family: 'API' },
  webhook: { label: 'Webhook', icon: Webhook, color: '#E8735A', family: 'Streaming' },
  aws_sqs: { label: 'AWS SQS', icon: Radio, color: '#FF9900', family: 'Streaming' },
  gcp_pubsub: { label: 'GCP Pub/Sub', icon: Radio, color: '#4285F4', family: 'Streaming' },
}

export const TYPE_OPTIONS = [
  { value: 'sqlite', label: 'SQLite' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'bigquery', label: 'Google BigQuery' },
  { value: 'athena', label: 'AWS Athena' },
  { value: 'api', label: 'REST API' },
  { value: 'webhook', label: 'Webhook (push)' },
  { value: 'aws_sqs', label: 'AWS SQS (streaming)' },
  { value: 'gcp_pubsub', label: 'GCP Pub/Sub (streaming)' },
]

export const DEFAULT_CONFIG = {
  sqlite: { db_path: '' },
  postgresql: { host: '', port: 5432, database: '', username: '', password: '' },
  bigquery: { project_id: '', credentials_json: '', location: '' },
  athena: { aws_access_key_id: '', aws_secret_access_key: '', region: '', s3_staging_dir: '', database: '', workgroup: 'primary' },
  api: {
    base_url: '', auth_type: 'none', bearer_token: '',
    basic_username: '', basic_password: '',
    api_key_name: '', api_key_value: '', api_key_location: 'header',
    oauth2_token_url: '', oauth2_client_id: '', oauth2_client_secret: '', oauth2_scope: '',
    default_headers: {}, default_query_params: {},
    timeout_seconds: 15, verify_tls: true,
  },
  webhook: { secret_token: '' },
  aws_sqs: { aws_access_key_id: '', aws_secret_access_key: '', region: '', queue_url: '' },
  gcp_pubsub: { project_id: '', subscription_id: '', credentials_json: '' },
}

export function configSummary(src) {
  const c = src.config || {}
  switch (src.type) {
    case 'sqlite': return c.db_path || '—'
    case 'postgresql': return c.host ? `${c.host}/${c.database || ''}` : '—'
    case 'bigquery': return c.project_id || '—'
    case 'athena': return c.s3_staging_dir || '—'
    case 'api': return c.base_url || '—'
    case 'webhook': return c.secret_token ? 'secret configured' : 'no secret — open endpoint'
    case 'aws_sqs': return c.queue_url || '—'
    case 'gcp_pubsub': return c.subscription_id ? `${c.project_id}/${c.subscription_id}` : '—'
    default: return '—'
  }
}

function KeyValueEditor({ value, onChange, keyPlaceholder = 'Key', valuePlaceholder = 'Value' }) {
  const [rows, setRows] = useState(() => Object.entries(value || {}).map(([k, v]) => ({ k, v })))

  const emit = (next) => {
    setRows(next)
    onChange(Object.fromEntries(next.filter((r) => r.k.trim()).map((r) => [r.k, r.v])))
  }
  const update = (idx, field, val) => emit(rows.map((r, i) => (i === idx ? { ...r, [field]: val } : r)))
  const add = () => emit([...rows, { k: '', v: '' }])
  const remove = (idx) => emit(rows.filter((_, i) => i !== idx))

  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input value={r.k} onChange={(v) => update(i, 'k', v)} placeholder={keyPlaceholder} />
          <Input value={r.v} onChange={(v) => update(i, 'v', v)} placeholder={valuePlaceholder} />
          <button type="button" onClick={() => remove(i)} className="p-1.5 flex-shrink-0">
            <Trash2 size={12} style={{ color: 'var(--text-tertiary)' }} />
          </button>
        </div>
      ))}
      <button type="button" onClick={add} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--accent-ink)' }}>
        <Plus size={11} /> Add
      </button>
    </div>
  )
}

export default function IntegrationConfigFields({ type, config, onChange }) {
  const setField = (key, value) => onChange({ ...config, [key]: value })

  if (type === 'sqlite') {
    return (
      <Field label="Database file path *" hint="Absolute path to a .sqlite/.db file on this machine">
        <Input value={config.db_path || ''} onChange={(v) => setField('db_path', v)} placeholder="C:/path/to/orders.sqlite" />
      </Field>
    )
  }

  if (type === 'postgresql') {
    return (
      <>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Host *">
            <Input value={config.host || ''} onChange={(v) => setField('host', v)} placeholder="localhost" />
          </Field>
          <Field label="Port">
            <Input type="number" value={config.port ?? 5432} onChange={(v) => setField('port', Number(v))} placeholder="5432" />
          </Field>
        </div>
        <Field label="Database *">
          <Input value={config.database || ''} onChange={(v) => setField('database', v)} placeholder="orders_db" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Username">
            <Input value={config.username || ''} onChange={(v) => setField('username', v)} placeholder="postgres" />
          </Field>
          <Field label="Password">
            <Input type="password" value={config.password || ''} onChange={(v) => setField('password', v)} placeholder="••••••••" />
          </Field>
        </div>
      </>
    )
  }

  if (type === 'bigquery') {
    return (
      <>
        <Field label="Project ID *">
          <Input value={config.project_id || ''} onChange={(v) => setField('project_id', v)} placeholder="my-gcp-project" />
        </Field>
        <Field label="Service account credentials (JSON) *" hint="Paste the full contents of a service-account key file — needs BigQuery Data Viewer + Job User at minimum">
          <TextArea value={config.credentials_json || ''} onChange={(v) => setField('credentials_json', v)} rows={5} mono placeholder='{"type": "service_account", ...}' />
        </Field>
        <Field label="Location (optional)" hint="e.g. US, EU, europe-west1 — leave empty to let BigQuery infer it">
          <Input value={config.location || ''} onChange={(v) => setField('location', v)} placeholder="US" />
        </Field>
      </>
    )
  }

  if (type === 'athena') {
    return (
      <>
        <div className="grid grid-cols-2 gap-3">
          <Field label="AWS access key ID">
            <Input value={config.aws_access_key_id || ''} onChange={(v) => setField('aws_access_key_id', v)} placeholder="Leave empty to use the default AWS credential chain" />
          </Field>
          <Field label="AWS secret access key">
            <Input type="password" value={config.aws_secret_access_key || ''} onChange={(v) => setField('aws_secret_access_key', v)} placeholder="••••••••" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Region *">
            <Input value={config.region || ''} onChange={(v) => setField('region', v)} placeholder="us-east-1" />
          </Field>
          <Field label="Workgroup">
            <Input value={config.workgroup || 'primary'} onChange={(v) => setField('workgroup', v)} placeholder="primary" />
          </Field>
        </div>
        <Field label="S3 query results location *" hint="Athena writes every query's output here — an s3:// URI you have write access to">
          <Input value={config.s3_staging_dir || ''} onChange={(v) => setField('s3_staging_dir', v)} placeholder="s3://my-bucket/athena-results/" />
        </Field>
        <Field label="Database (optional)">
          <Input value={config.database || ''} onChange={(v) => setField('database', v)} placeholder="default" />
        </Field>
      </>
    )
  }

  if (type === 'api') {
    const authType = config.auth_type || 'none'
    return (
      <>
        <Field label="Base URL *" hint="Must resolve to a public address — local/private IPs are blocked">
          <Input value={config.base_url || ''} onChange={(v) => setField('base_url', v)} placeholder="https://api.example.com" />
        </Field>

        <Field label="Authentication">
          <Select
            value={authType}
            onChange={(v) => setField('auth_type', v)}
            options={[
              { value: 'none', label: 'None' },
              { value: 'bearer', label: 'Bearer token' },
              { value: 'basic', label: 'Basic auth' },
              { value: 'api_key', label: 'API key (header or query param)' },
              { value: 'oauth2_client_credentials', label: 'OAuth2 — client credentials' },
            ]}
          />
        </Field>

        {authType === 'bearer' && (
          <Field label="Bearer token">
            <Input type="password" value={config.bearer_token || ''} onChange={(v) => setField('bearer_token', v)} placeholder="Sent as Authorization: Bearer …" />
          </Field>
        )}

        {authType === 'basic' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Username">
              <Input value={config.basic_username || ''} onChange={(v) => setField('basic_username', v)} />
            </Field>
            <Field label="Password">
              <Input type="password" value={config.basic_password || ''} onChange={(v) => setField('basic_password', v)} />
            </Field>
          </div>
        )}

        {authType === 'api_key' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Header/param name">
                <Input value={config.api_key_name || ''} onChange={(v) => setField('api_key_name', v)} placeholder="X-API-Key" />
              </Field>
              <Field label="Send as">
                <Select
                  value={config.api_key_location || 'header'}
                  onChange={(v) => setField('api_key_location', v)}
                  options={[{ value: 'header', label: 'Header' }, { value: 'query', label: 'Query param' }]}
                />
              </Field>
            </div>
            <Field label="Key value">
              <Input type="password" value={config.api_key_value || ''} onChange={(v) => setField('api_key_value', v)} />
            </Field>
          </>
        )}

        {authType === 'oauth2_client_credentials' && (
          <>
            <Field label="Token URL">
              <Input value={config.oauth2_token_url || ''} onChange={(v) => setField('oauth2_token_url', v)} placeholder="https://auth.example.com/oauth/token" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Client ID">
                <Input value={config.oauth2_client_id || ''} onChange={(v) => setField('oauth2_client_id', v)} />
              </Field>
              <Field label="Client secret">
                <Input type="password" value={config.oauth2_client_secret || ''} onChange={(v) => setField('oauth2_client_secret', v)} />
              </Field>
            </div>
            <Field label="Scope (optional)">
              <Input value={config.oauth2_scope || ''} onChange={(v) => setField('oauth2_scope', v)} />
            </Field>
          </>
        )}

        <Field label="Default headers (optional)" hint="Merged into every request; a pipeline can add more on top">
          <KeyValueEditor value={config.default_headers} onChange={(v) => setField('default_headers', v)} keyPlaceholder="Header name" />
        </Field>
        <Field label="Default query parameters (optional)">
          <KeyValueEditor value={config.default_query_params} onChange={(v) => setField('default_query_params', v)} keyPlaceholder="Param name" />
        </Field>

        <div className="grid grid-cols-2 gap-3 items-end">
          <Field label="Timeout (seconds)">
            <Input type="number" value={config.timeout_seconds ?? 15} onChange={(v) => setField('timeout_seconds', Number(v))} />
          </Field>
          <div className="pb-2.5">
            <Checkbox checked={config.verify_tls !== false} onChange={(v) => setField('verify_tls', v)} label="Verify TLS certificates" />
          </div>
        </div>
      </>
    )
  }

  if (type === 'webhook') {
    return (
      <Field label="Shared secret" hint="Callers must send it as the X-Webhook-Secret header. Strongly recommended — an unset secret means anyone with the URL can write data.">
        <Input type="password" value={config.secret_token || ''} onChange={(v) => setField('secret_token', v)} placeholder="A long random string" />
      </Field>
    )
  }

  if (type === 'aws_sqs') {
    return (
      <>
        <div className="grid grid-cols-2 gap-3">
          <Field label="AWS access key ID">
            <Input value={config.aws_access_key_id || ''} onChange={(v) => setField('aws_access_key_id', v)} placeholder="Leave empty to use the default AWS credential chain" />
          </Field>
          <Field label="AWS secret access key">
            <Input type="password" value={config.aws_secret_access_key || ''} onChange={(v) => setField('aws_secret_access_key', v)} placeholder="••••••••" />
          </Field>
        </div>
        <Field label="Region *">
          <Input value={config.region || ''} onChange={(v) => setField('region', v)} placeholder="us-east-1" />
        </Field>
        <Field label="Queue URL *">
          <Input value={config.queue_url || ''} onChange={(v) => setField('queue_url', v)} placeholder="https://sqs.us-east-1.amazonaws.com/123456789/my-queue" />
        </Field>
      </>
    )
  }

  if (type === 'gcp_pubsub') {
    return (
      <>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Project ID *">
            <Input value={config.project_id || ''} onChange={(v) => setField('project_id', v)} placeholder="my-gcp-project" />
          </Field>
          <Field label="Subscription ID *">
            <Input value={config.subscription_id || ''} onChange={(v) => setField('subscription_id', v)} placeholder="my-subscription" />
          </Field>
        </div>
        <Field label="Service account credentials (JSON) *" hint="Needs Pub/Sub Subscriber on this subscription">
          <TextArea value={config.credentials_json || ''} onChange={(v) => setField('credentials_json', v)} rows={5} mono placeholder='{"type": "service_account", ...}' />
        </Field>
      </>
    )
  }

  return null
}
