import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight, Check, ChevronDown, CircleAlert, Database, Laptop, Loader2,
  RotateCcw, Settings2, ShieldCheck, Sparkles, TriangleAlert, Wand2, Wrench,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { applyAIPlan, generateAIPlan, getAISettings, listDatasets } from '../api/businessHub'
import AISettingsModal from '../components/AISettingsModal'
import { Checkbox, TextArea } from '../components/FormFields'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/Toast'
import WidgetRenderer from '../components/WidgetRenderer'

const EASE = [0.16, 1, 0.3, 1]

const STAGES = [
  'Profiling bronze tables',
  'Designing the silver layer',
  'Designing gold aggregates',
  'Composing the dashboard',
  'Dry-running every query',
]

const LAYER_COLOR = { bronze: 'var(--coral)', silver: 'var(--azure)', gold: 'var(--gold)' }

const GOAL_IDEAS = [
  'Where is revenue coming from, and how is it trending?',
  'Which customers matter most and how are they behaving?',
  'Spot operational problems: cancellations, delays, failures.',
]

export default function AIBuilder() {
  const toast = useToast()
  const navigate = useNavigate()
  const [datasets, setDatasets] = useState([])
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState(null)
  const [showSettings, setShowSettings] = useState(false)

  const [selected, setSelected] = useState(new Set())
  const [goal, setGoal] = useState('')
  const [includeSamples, setIncludeSamples] = useState(true)

  const [phase, setPhase] = useState('setup') // setup | generating | review
  const [result, setResult] = useState(null)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    Promise.all([listDatasets(), getAISettings()])
      .then(([d, s]) => {
        setDatasets(d)
        setSettings(s.settings)
        const bronze = d.filter((x) => x.layer === 'bronze')
        if (bronze.length <= 4) setSelected(new Set(bronze.map((x) => x.table_name)))
      })
      .catch(() => toast.error('Failed to load data'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const bronze = datasets.filter((d) => d.layer === 'bronze')
  const providerReady = settings && settings.model && (settings.api_key_set || settings.configured)

  const toggle = (table) =>
    setSelected((cur) => {
      const next = new Set(cur)
      next.has(table) ? next.delete(table) : next.add(table)
      return next
    })

  const generate = async () => {
    if (!providerReady) {
      setShowSettings(true)
      return
    }
    setPhase('generating')
    try {
      const r = await generateAIPlan({ tables: [...selected], goal, include_samples: includeSamples })
      setResult(r)
      setPhase('review')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Generation failed')
      setPhase('setup')
    }
  }

  const apply = async () => {
    setApplying(true)
    try {
      const r = await applyAIPlan(result.plan)
      const skipped = r.widgets_skipped.length ? ` (${r.widgets_skipped.length} widget${r.widgets_skipped.length > 1 ? 's' : ''} skipped)` : ''
      toast.success(`Created ${r.tables.length} tables and a ${r.widgets_created}-widget dashboard${skipped}.`)
      navigate(`/dashboards/${r.dashboard_id}`)
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Apply failed')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="AI Builder"
        title="Bronze to dashboard, generated"
        description="Pick raw tables and describe what you want to learn. The AI designs silver and gold layers plus a dashboard, then every query is dry-run against your data before anything is created."
        actions={<ProviderChip settings={settings} onClick={() => setShowSettings(true)} />}
      />

      <AnimatePresence mode="wait">
        {phase === 'setup' && (
          <motion.div key="setup" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: EASE }}>
            <SetupStep
              loading={loading}
              bronze={bronze}
              selected={selected}
              toggle={toggle}
              goal={goal}
              setGoal={setGoal}
              includeSamples={includeSamples}
              setIncludeSamples={setIncludeSamples}
              providerReady={providerReady}
              onGenerate={generate}
              onSeed={() => navigate('/')}
            />
          </motion.div>
        )}
        {phase === 'generating' && (
          <motion.div key="generating" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: EASE }}>
            <GeneratingStep settings={settings} tableCount={selected.size} />
          </motion.div>
        )}
        {phase === 'review' && result && (
          <motion.div key="review" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: EASE }}>
            <ReviewStep result={result} applying={applying} onApply={apply} onRegenerate={generate} onBack={() => setPhase('setup')} />
          </motion.div>
        )}
      </AnimatePresence>

      <AISettingsModal open={showSettings} onClose={() => setShowSettings(false)} onSaved={setSettings} />
    </div>
  )
}

function ProviderChip({ settings, onClick }) {
  if (!settings) return null
  const local = settings.preset === 'ollama' || settings.preset === 'lmstudio'
  return (
    <button onClick={onClick} className="bh-btn-ghost flex items-center gap-2">
      {local ? <Laptop size={13} /> : <Settings2 size={13} />}
      <span className="font-mono-num text-[12px]">{settings.model || 'Choose a model'}</span>
    </button>
  )
}

// ─── Step 1: setup ──────────────────────────────────────────────────────

function SetupStep({ loading, bronze, selected, toggle, goal, setGoal, includeSamples, setIncludeSamples, providerReady, onGenerate, onSeed }) {
  if (loading) return <div className="h-72 rounded-xl animate-pulse" style={{ background: 'var(--surface)' }} />

  if (bronze.length === 0) {
    return (
      <div className="bh-card p-10 text-center max-w-xl mx-auto">
        <Database size={26} className="mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} />
        <p className="font-medium" style={{ color: 'var(--text-primary)' }}>No bronze tables yet</p>
        <p className="text-[13px] mt-1.5 mb-5" style={{ color: 'var(--text-secondary)' }}>
          Run an ingestion pipeline first, or seed the demo data to try the AI Builder on sample orders.
        </p>
        <button onClick={onSeed} className="bh-btn-primary">Go to Overview</button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <div className="bh-card p-6 lg:col-span-3">
        <StepLabel n="1" label="Choose source tables" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
          {bronze.map((d) => {
            const on = selected.has(d.table_name)
            return (
              <motion.button
                key={d.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => toggle(d.table_name)}
                className="text-left px-3.5 py-3 rounded-md flex items-center gap-3 transition-colors"
                style={{
                  border: `1px solid ${on ? 'var(--accent)' : 'var(--hairline-strong)'}`,
                  background: on ? 'var(--accent-soft)' : 'var(--surface)',
                }}
              >
                <span
                  className="w-4 h-4 rounded-[3px] flex items-center justify-center flex-shrink-0 transition-colors"
                  style={{ background: on ? 'var(--accent)' : 'var(--fill-3)' }}
                >
                  {on && <Check size={11} strokeWidth={3} style={{ color: 'var(--on-accent)' }} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{d.name}</span>
                  <span className="block font-mono-num text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                    {d.table_name} · {(d.row_count ?? 0).toLocaleString('en-US')} rows
                  </span>
                </span>
              </motion.button>
            )
          })}
        </div>
      </div>

      <div className="bh-card p-6 lg:col-span-2 flex flex-col">
        <StepLabel n="2" label="What should it answer?" />
        <div className="mt-4">
          <TextArea value={goal} onChange={setGoal} rows={4} placeholder="Optional — e.g. track revenue by region and find our most valuable customers." />
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {GOAL_IDEAS.map((idea) => (
            <button
              key={idea}
              onClick={() => setGoal(idea)}
              className="text-[11px] px-2 py-1 rounded transition-colors hover:bg-ink/[0.06]"
              style={{ background: 'var(--fill-2)', color: 'var(--text-secondary)' }}
            >
              {idea}
            </button>
          ))}
        </div>

        <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--hairline)' }}>
          <Checkbox checked={includeSamples} onChange={setIncludeSamples} label="Share sample values with the model" />
          <p className="text-[11px] mt-1.5 leading-relaxed flex gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
            <ShieldCheck size={12} className="flex-shrink-0 mt-px" />
            {includeSamples
              ? 'Column types, stats, min/max and 5 sample rows per table are sent to your provider. Better SQL, less privacy.'
              : 'Only column names, types and counts are sent — no actual values.'}
          </p>
        </div>

        <div className="mt-auto pt-6">
          <button onClick={onGenerate} disabled={selected.size === 0} className="bh-btn-primary w-full flex items-center justify-center gap-2 !py-3 !text-sm">
            <Wand2 size={15} />
            {providerReady ? `Generate from ${selected.size} table${selected.size === 1 ? '' : 's'}` : 'Set up an AI provider'}
          </button>
        </div>
      </div>
    </div>
  )
}

function StepLabel({ n, label }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-6 h-6 rounded flex items-center justify-center font-mono-num text-[11px] font-semibold" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
        {n}
      </span>
      <p className="font-semibold text-[15px]" style={{ color: 'var(--text-primary)' }}>{label}</p>
    </div>
  )
}

// ─── Step 2: generating ─────────────────────────────────────────────────

function GeneratingStep({ settings, tableCount }) {
  const [elapsed, setElapsed] = useState(0)
  const started = useRef(Date.now())

  useEffect(() => {
    const t = setInterval(() => setElapsed((Date.now() - started.current) / 1000), 200)
    return () => clearInterval(t)
  }, [])

  // The server doesn't stream progress, so stages advance on a gentle
  // clock and hold on the last one — honest about order, not timing.
  const stage = Math.min(STAGES.length - 1, Math.floor(elapsed / 8))

  return (
    <div className="bh-card bh-no-rise p-10 max-w-2xl mx-auto overflow-hidden">
      <div className="bh-scanline" aria-hidden />
      <div className="flex items-center gap-4 mb-8">
        <div className="relative w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(155deg, #6BE8BF, #2FC794)' }}>
          <span className="bh-pulse-ring" aria-hidden />
          <Sparkles size={20} style={{ color: 'var(--on-accent)' }} className="bh-twinkle" />
        </div>
        <div>
          <p className="font-semibold text-[17px]" style={{ color: 'var(--text-primary)' }}>Designing your medallion…</p>
          <p className="text-[12px] font-mono-num mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {settings?.model} · {tableCount} table{tableCount === 1 ? '' : 's'} · {elapsed.toFixed(0)}s
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {STAGES.map((label, i) => {
          const state = i < stage ? 'done' : i === stage ? 'active' : 'todo'
          return (
            <motion.div
              key={label}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: state === 'todo' ? 0.4 : 1, x: 0 }}
              transition={{ delay: i * 0.06, duration: 0.4, ease: EASE }}
              className="flex items-center gap-3"
            >
              <span
                className="w-5 h-5 rounded-[3px] flex items-center justify-center flex-shrink-0 transition-colors duration-300"
                style={{ background: state === 'done' ? 'var(--accent)' : state === 'active' ? 'var(--accent-soft)' : 'var(--fill-2)' }}
              >
                {state === 'done' && <Check size={12} strokeWidth={3} style={{ color: 'var(--on-accent)' }} />}
                {state === 'active' && <Loader2 size={12} className="animate-spin" style={{ color: 'var(--accent-ink)' }} />}
              </span>
              <span className="text-[13px]" style={{ color: state === 'active' ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: state === 'active' ? 500 : 400 }}>
                {label}
              </span>
            </motion.div>
          )
        })}
      </div>

      <p className="text-[11px] mt-8" style={{ color: 'var(--text-tertiary)' }}>
        Usually 30–90 seconds. If any SQL fails the dry run, the model gets the error and repairs its own plan.
      </p>
    </div>
  )
}

// ─── Step 3: review ─────────────────────────────────────────────────────

function ReviewStep({ result, applying, onApply, onRegenerate, onBack }) {
  const { plan, validation, attempts } = result
  const transformErrors = validation.transforms.filter((t) => t.status === 'error').length
  const widgetErrors = validation.widgets.filter((w) => w.status === 'error').length
  const repaired = attempts.slice(0, -1).reduce((n, a) => n + a.errors.length, 0)

  const status = (layer, i) => validation.transforms.filter((t) => t.layer === layer)[i] || {}

  return (
    <div className="space-y-6">
      <div className="bh-card p-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 flex-wrap mb-2.5">
              <Badge tone="accent" icon={Sparkles}>{result.model}</Badge>
              <Badge>{result.elapsed_seconds}s</Badge>
              {repaired > 0 ? (
                <Badge tone="accent" icon={Wrench}>
                  Self-repaired {repaired} issue{repaired === 1 ? '' : 's'} in {attempts.length - 1} round{attempts.length > 2 ? 's' : ''}
                </Badge>
              ) : (
                <Badge tone="accent" icon={Check}>Passed the dry run first try</Badge>
              )}
            </div>
            <p className="text-[14px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{plan.summary}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onBack} className="bh-btn-ghost flex items-center gap-1.5"><RotateCcw size={13} /> Start over</button>
            <button onClick={onRegenerate} className="bh-btn-ghost flex items-center gap-1.5"><Wand2 size={13} /> Regenerate</button>
          </div>
        </div>

        {(transformErrors > 0 || widgetErrors > 0) && (
          <div className="mt-4 flex items-start gap-2 text-[12px] px-3 py-2.5 rounded-md" style={{ background: 'rgba(229,72,77,0.07)', color: 'var(--danger)' }}>
            <CircleAlert size={14} className="flex-shrink-0 mt-px" />
            {transformErrors > 0
              ? `${transformErrors} transform${transformErrors === 1 ? '' : 's'} still fail after repairs — regenerate (maybe with a clearer goal) before creating.`
              : `${widgetErrors} widget${widgetErrors === 1 ? '' : 's'} failed validation and will be skipped.`}
          </div>
        )}
      </div>

      {/* Medallion flow */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1.3fr_auto_1.3fr] gap-3 items-start">
        <LayerColumn layer="bronze" title="Bronze" subtitle="Raw sources">
          {result.source_tables.map((t, i) => (
            <TransformCard key={t} index={i} layer="bronze" name={t} table={t} />
          ))}
        </LayerColumn>
        <FlowArrow />
        <LayerColumn layer="silver" title="Silver" subtitle="Cleaned & typed">
          {plan.silver.map((t, i) => (
            <TransformCard key={t.target_table} index={i} layer="silver" name={t.name} table={t.target_table} description={t.description} sql={t.sql} status={status('silver', i)} />
          ))}
        </LayerColumn>
        <FlowArrow />
        <LayerColumn layer="gold" title="Gold" subtitle="Business-ready">
          {plan.gold.map((t, i) => (
            <TransformCard key={t.target_table} index={i} layer="gold" name={t.name} table={t.target_table} description={t.description} sql={t.sql} status={status('gold', i)} />
          ))}
        </LayerColumn>
      </div>

      {/* Dashboard preview */}
      <div>
        <div className="flex items-end justify-between gap-4 mb-3 flex-wrap">
          <div>
            <p className="bh-label bh-eyebrow mb-1.5" style={{ color: 'var(--accent-ink)' }}>Dashboard preview · live data</p>
            <p className="font-semibold text-[20px]" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{plan.dashboard.name}</p>
            {plan.dashboard.description && <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>{plan.dashboard.description}</p>}
          </div>
        </div>
        <DashboardPreview widgets={plan.dashboard.widgets} validation={validation.widgets} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4, ease: EASE }}
        className="sticky bottom-4 z-20 flex items-center justify-between gap-4 px-5 py-3.5 rounded-xl bh-glass flex-wrap"
        style={{ border: '1px solid var(--hairline-strong)', boxShadow: 'var(--shadow-lg)' }}
      >
        <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
          Creates <b style={{ color: 'var(--text-primary)' }}>{plan.silver.length + plan.gold.length} tables</b> and a dashboard with{' '}
          <b style={{ color: 'var(--text-primary)' }}>{plan.dashboard.widgets.length - widgetErrors} widgets</b>. Everything stays editable afterwards.
        </p>
        <button onClick={onApply} disabled={applying || transformErrors > 0} className="bh-btn-primary flex items-center gap-2 !px-5 !py-2.5 !text-sm">
          {applying ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {applying ? 'Creating…' : 'Create everything'}
        </button>
      </motion.div>
    </div>
  )
}

function Badge({ children, tone, icon: Icon }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-[3px] font-mono-num"
      style={tone === 'accent' ? { background: 'var(--accent-soft)', color: 'var(--accent-ink)' } : { background: 'var(--fill-2)', color: 'var(--text-secondary)' }}
    >
      {Icon && <Icon size={11} />}
      {children}
    </span>
  )
}

function LayerColumn({ layer, title, subtitle, children }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-2.5 px-0.5">
        <span className="w-2 h-2 rounded-[1px]" style={{ background: LAYER_COLOR[layer] }} />
        <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</p>
        <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{subtitle}</p>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function FlowArrow() {
  return (
    <div className="hidden md:flex items-center self-stretch pt-8">
      <div className="bh-flow-arrow">
        <ArrowRight size={14} style={{ color: 'var(--accent-ink)' }} />
      </div>
    </div>
  )
}

function TransformCard({ index, layer, name, table, description, sql, status = {} }) {
  const [open, setOpen] = useState(false)
  const tone = status.status === 'error' ? 'var(--danger)' : status.status === 'warning' ? 'var(--warning)' : LAYER_COLOR[layer]
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.06 + (layer === 'silver' ? 0.15 : layer === 'gold' ? 0.3 : 0), duration: 0.4, ease: EASE }}
      className="bh-card bh-no-rise overflow-hidden"
      style={{ borderLeft: `3px solid ${tone}` }}
    >
      <button onClick={() => sql && setOpen(!open)} className="w-full text-left px-3.5 py-3" disabled={!sql}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{name}</p>
            <p className="font-mono-num text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>
              {table}
              {status.row_count != null && ` · ${status.row_count.toLocaleString('en-US')} rows`}
            </p>
          </div>
          {sql && <ChevronDown size={14} className="flex-shrink-0 mt-0.5 transition-transform" style={{ color: 'var(--text-tertiary)', transform: open ? 'rotate(180deg)' : 'none' }} />}
        </div>
        {description && <p className="text-[12px] mt-1.5 leading-snug" style={{ color: 'var(--text-secondary)' }}>{description}</p>}
        {status.message && (
          <p className="text-[11px] mt-1.5 flex gap-1" style={{ color: tone }}>
            {status.status === 'error' ? <CircleAlert size={11} className="flex-shrink-0 mt-px" /> : <TriangleAlert size={11} className="flex-shrink-0 mt-px" />}
            {status.message}
          </p>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.pre
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="font-mono-num text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap px-3.5"
            style={{ background: '#fafbfb', borderTop: '1px solid var(--hairline)', color: 'var(--text-primary)' }}
          >
            <div className="py-3">{sql}</div>
          </motion.pre>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function toWidget(w) {
  const spec =
    w.type === 'kpi' ? { value_column: w.value_column, format: w.format || 'number' }
    : w.type === 'pie' ? { label_column: w.label_column, value_column: w.value_column }
    : w.type === 'table' ? { columns: null }
    : { x_column: w.x_column, y_columns: w.y_columns || [] }
  return { title: w.title, widget_type: w.type, spec }
}

function DashboardPreview({ widgets, validation }) {
  const kpiCount = widgets.filter((w) => w.type === 'kpi').length
  const kpiSpan = 12 / Math.min(Math.max(kpiCount, 1), 4)
  const ordered = widgets.map((w, i) => ({ w, v: validation[i] || {} })).sort((a, b) => (a.w.type === 'kpi' ? 0 : 1) - (b.w.type === 'kpi' ? 0 : 1))

  return (
    <div className="grid grid-cols-12 gap-3" style={{ gridAutoFlow: 'row dense' }}>
      {ordered.map(({ w, v }, i) => {
        const span = w.type === 'kpi' ? kpiSpan : Math.max(4, Math.min(12, w.width || (w.type === 'table' ? 12 : 6)))
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.2 + i * 0.05, duration: 0.45, ease: EASE }}
            className="bh-card bh-no-rise flex flex-col overflow-hidden"
            style={{ gridColumn: `span ${span} / span ${span}`, height: w.type === 'kpi' ? 112 : w.type === 'table' ? 300 : 270 }}
          >
            {w.type !== 'kpi' && (
              <p className="text-xs font-medium truncate px-4 pt-3.5 pb-1.5" style={{ color: 'var(--text-secondary)' }}>{w.title}</p>
            )}
            <div className={`flex-1 min-h-0 px-4 pb-4 ${w.type === 'kpi' ? 'pt-3.5' : 'pt-1'}`}>
              {v.status === 'error' ? (
                <div className="h-full flex flex-col items-center justify-center text-center gap-1.5 text-[11px] px-3" style={{ color: 'var(--danger)' }}>
                  <CircleAlert size={16} />
                  <span><b>{w.title}</b> will be skipped: {v.message}</span>
                </div>
              ) : (
                <WidgetRenderer widget={toWidget(w)} data={v.preview} />
              )}
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
