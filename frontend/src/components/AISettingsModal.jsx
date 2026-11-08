import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, CircleAlert, Laptop, Loader2, Plug } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getAISettings, saveAISettings, testAIConnection } from '../api/businessHub'
import { Field, Input } from './FormFields'
import Modal from './Modal'
import { useToast } from './Toast'

const LOCAL_PRESETS = new Set(['ollama', 'lmstudio'])

const MODEL_HINTS = {
  anthropic: 'Claude model id — claude-opus-5-5 is the default.',
  ollama: 'A model you have pulled, e.g. llama3.1 or qwen2.5-coder.',
  lmstudio: 'The model identifier shown in LM Studio.',
}

export default function AISettingsModal({ open, onClose, onSaved }) {
  const toast = useToast()
  const [presets, setPresets] = useState({})
  const [saved, setSaved] = useState(null)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [test, setTest] = useState(null) // { state: 'running' | 'ok' | 'error', message }

  useEffect(() => {
    if (!open) return
    setTest(null)
    getAISettings()
      .then(({ settings, presets }) => {
        setPresets(presets)
        setSaved(settings)
        setForm({ preset: settings.preset, model: settings.model, base_url: settings.base_url, api_key: '', clear_api_key: false })
      })
      .catch(() => toast.error('Failed to load AI settings'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const preset = form && presets[form.preset]
  const set = (patch) => {
    setTest(null)
    setForm((f) => ({ ...f, ...patch }))
  }

  const choosePreset = (key) => {
    const p = presets[key]
    const sameAsSaved = key === saved?.preset
    set({
      preset: key,
      base_url: sameAsSaved ? saved.base_url : '',
      model: sameAsSaved ? saved.model : p.default_model || '',
      api_key: '',
      clear_api_key: false,
    })
  }

  const payload = () => ({
    provider: preset.provider,
    preset: form.preset,
    model: form.model,
    base_url: form.base_url,
    api_key: form.api_key || null,
    clear_api_key: form.clear_api_key,
  })

  const runTest = async () => {
    setTest({ state: 'running' })
    try {
      const r = await testAIConnection(payload())
      setTest({ state: 'ok', message: `${r.model} answered in ${(r.elapsed_ms / 1000).toFixed(1)}s` })
    } catch (e) {
      setTest({ state: 'error', message: e.response?.data?.detail || 'Connection failed' })
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      const r = await saveAISettings(payload())
      toast.success(`AI provider saved — ${preset.label}, ${r.settings.model}`)
      onSaved?.(r.settings)
      onClose()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const keyPlaceholder = () => {
    if (!form || !preset) return ''
    const keyIsSaved = saved?.api_key_set && saved.preset === form.preset && !form.clear_api_key
    if (keyIsSaved && saved.api_key_source === 'environment') return `Using the key from your environment (${saved.api_key_hint})`
    if (keyIsSaved) return `Saved key ${saved.api_key_hint || ''} — leave blank to keep it`
    return preset.needs_key ? 'Paste your API key' : 'Not required'
  }

  return (
    <Modal open={open} onClose={onClose} title="AI provider" width={560}>
      {!form || !preset ? (
        <div className="h-48 rounded-lg animate-pulse" style={{ background: 'var(--fill-2)' }} />
      ) : (
        <div className="space-y-4">
          <p className="text-[13px] -mt-2 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Business Hub works with any provider: Claude directly, or anything that speaks the OpenAI-compatible API — including models running on this machine.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {Object.entries(presets).map(([key, p]) => {
              const active = key === form.preset
              return (
                <button
                  key={key}
                  onClick={() => choosePreset(key)}
                  className="relative text-left px-2.5 py-2 rounded-md text-[12px] font-medium transition-colors"
                  style={{
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--hairline-strong)'}`,
                    background: active ? 'var(--accent-soft)' : 'var(--surface)',
                    color: active ? 'var(--accent-ink)' : 'var(--text-secondary)',
                  }}
                >
                  <span className="flex items-center gap-1.5">
                    {LOCAL_PRESETS.has(key) ? <Laptop size={11} /> : <Plug size={11} />}
                    {p.label.replace(' (local)', '')}
                  </span>
                </button>
              )
            })}
          </div>

          {LOCAL_PRESETS.has(form.preset) && (
            <p className="text-[12px] px-3 py-2 rounded-md" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}>
              Runs locally — table profiles never leave this machine.
            </p>
          )}

          <Field label="Model *" hint={MODEL_HINTS[form.preset] || 'The model id exactly as your provider lists it.'}>
            <Input value={form.model} onChange={(v) => set({ model: v })} placeholder="model id" />
          </Field>

          {preset.provider === 'openai_compatible' && (
            <Field label="Base URL" hint={preset.base_url ? `Default: ${preset.base_url}` : 'The URL ending in /v1 that serves /chat/completions.'}>
              <Input value={form.base_url} onChange={(v) => set({ base_url: v })} placeholder={preset.base_url || 'https://…/v1'} />
            </Field>
          )}

          <Field label="API key">
            <Input type="password" value={form.api_key} onChange={(v) => set({ api_key: v, clear_api_key: false })} placeholder={keyPlaceholder()} />
            {saved?.api_key_source === 'settings' && saved.preset === form.preset && !form.clear_api_key && (
              <button onClick={() => set({ clear_api_key: true, api_key: '' })} className="text-[11px] mt-1.5" style={{ color: 'var(--danger)' }}>
                Remove saved key
              </button>
            )}
          </Field>

          <AnimatePresence>
            {test && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div
                  className="flex items-start gap-2 text-[12px] px-3 py-2 rounded-md"
                  style={{
                    background: test.state === 'error' ? 'rgba(229,72,77,0.08)' : 'var(--fill-2)',
                    color: test.state === 'error' ? 'var(--danger)' : test.state === 'ok' ? 'var(--accent-ink)' : 'var(--text-secondary)',
                  }}
                >
                  {test.state === 'running' && <Loader2 size={14} className="animate-spin flex-shrink-0 mt-px" />}
                  {test.state === 'ok' && <CheckCircle2 size={14} className="flex-shrink-0 mt-px" />}
                  {test.state === 'error' && <CircleAlert size={14} className="flex-shrink-0 mt-px" />}
                  <span>{test.state === 'running' ? 'Asking the model for a test reply…' : test.message}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex justify-between gap-2 pt-2">
            <button onClick={runTest} disabled={!form.model || test?.state === 'running'} className="bh-btn-ghost">
              Test connection
            </button>
            <div className="flex gap-2">
              <button onClick={onClose} className="bh-btn-ghost">
                Cancel
              </button>
              <button onClick={save} disabled={saving || !form.model} className="bh-btn-primary">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
