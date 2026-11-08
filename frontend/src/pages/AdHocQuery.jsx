import { Play, Save, TerminalSquare, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createSavedQuery, deleteSavedQuery, listSavedQueries, runAdHocQuery } from '../api/businessHub'
import { Input, TextArea } from '../components/FormFields'
import PageHeader from '../components/PageHeader'
import ResultsTable from '../components/ResultsTable'
import { useToast } from '../components/Toast'

export default function AdHocQuery() {
  const toast = useToast()
  const [sql, setSql] = useState('SELECT * FROM gold_revenue_by_category')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState([])
  const [showSaveAs, setShowSaveAs] = useState(false)
  const [saveName, setSaveName] = useState('')

  const loadSaved = () => listSavedQueries().then(setSaved).catch(() => {})
  useEffect(() => {
    loadSaved()
  }, [])

  const run = async () => {
    setRunning(true)
    setError('')
    try {
      const r = await runAdHocQuery(sql)
      setResult(r)
    } catch (e) {
      setError(e.response?.data?.detail || 'Query failed')
      setResult(null)
    } finally {
      setRunning(false)
    }
  }

  const saveAs = async () => {
    if (!saveName.trim()) return
    try {
      await createSavedQuery({ name: saveName, sql_text: sql })
      toast.success('Saved query created')
      setShowSaveAs(false)
      setSaveName('')
      loadSaved()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed')
    }
  }

  const removeSaved = async (id, e) => {
    e.stopPropagation()
    try {
      await deleteSavedQuery(id)
      loadSaved()
    } catch (e2) {
      toast.error(e2.response?.data?.detail || 'Delete failed — may be used by a dashboard widget')
    }
  }

  return (
    <div>
      <PageHeader icon={TerminalSquare} eyebrow="Business Hub" title="Ad Hoc Query" description="Run read-only SQL against every dataset in the lake — save the ones worth keeping." />

      <div className="grid grid-cols-[1fr_260px] gap-6 items-start">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="bh-label">SQL</p>
            <div className="flex items-center gap-2">
              {showSaveAs ? (
                <div className="flex items-center gap-1.5">
                  <div className="w-40">
                    <Input value={saveName} onChange={setSaveName} placeholder="Query name" />
                  </div>
                  <button onClick={saveAs} className="bh-btn-primary text-xs py-1 px-2.5">
                    Save
                  </button>
                  <button onClick={() => setShowSaveAs(false)} className="text-xs px-1" style={{ color: 'var(--text-tertiary)' }}>
                    ✕
                  </button>
                </div>
              ) : (
                <button onClick={() => setShowSaveAs(true)} className="bh-btn-ghost flex items-center gap-1.5 text-xs py-1 px-2.5">
                  <Save size={11} /> Save As…
                </button>
              )}
              <button onClick={run} disabled={running} className="bh-btn-primary flex items-center gap-1.5 text-xs py-1 px-2.5">
                <Play size={11} className={running ? 'animate-pulse' : ''} /> {running ? 'Running…' : 'Run'}
              </button>
            </div>
          </div>
          <TextArea value={sql} onChange={setSql} rows={8} mono />

          {error && (
            <p className="text-xs mt-3 px-3 py-2 rounded-lg" style={{ color: 'var(--danger)', background: 'rgba(240,101,75,0.08)' }}>
              {error}
            </p>
          )}

          {result && (
            <div className="mt-4">
              <p className="bh-label mb-2">
                Result — {result.row_count} row{result.row_count === 1 ? '' : 's'}
              </p>
              <ResultsTable data={result} maxHeight={440} />
            </div>
          )}
        </div>

        <div>
          <p className="bh-label mb-2">Saved Queries</p>
          <div className="space-y-1.5">
            {saved.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                None yet.
              </p>
            )}
            {saved.map((q) => (
              <div
                key={q.id}
                onClick={() => setSql(q.sql_text)}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer group transition-colors hover:bg-ink/[0.05]"
                style={{ background: 'var(--surface)' }}
              >
                <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                  {q.name}
                </p>
                <button onClick={(e) => removeSaved(q.id, e)} className="opacity-0 group-hover:opacity-100 flex-shrink-0">
                  <Trash2 size={11} style={{ color: 'var(--text-tertiary)' }} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
