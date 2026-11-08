import { motion } from 'framer-motion'
import { Database, Layers } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getDatasetSchema, listDatasets, previewDataset } from '../api/businessHub'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import ResultsTable from '../components/ResultsTable'
import { useToast } from '../components/Toast'

const LAYER_META = {
  bronze: { label: 'Bronze', color: '#D9603F', desc: 'Raw, as-ingested from the source' },
  silver: { label: 'Silver', color: '#2F86C9', desc: 'Cleaned and typed' },
  gold: { label: 'Gold', color: '#C08A1E', desc: 'Aggregated, dashboard-ready' },
}

export default function Datasets() {
  const toast = useToast()
  const [datasets, setDatasets] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    listDatasets()
      .then(setDatasets)
      .catch(() => toast.error('Failed to load dataset catalog'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const grouped = ['bronze', 'silver', 'gold'].map((layer) => ({
    layer,
    items: datasets.filter((d) => d.layer === layer),
  }))

  return (
    <div>
      <PageHeader
        icon={Layers}
        eyebrow="Business Hub"
        title="Dataset Catalog"
        description="Every table produced by a pipeline or transform, organized by medallion layer."
      />

      {loading ? (
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: 'var(--surface)' }} />
          ))}
        </div>
      ) : datasets.length === 0 ? (
        <EmptyState icon={Database} title="No datasets yet — run a pipeline or transform first." />
      ) : (
        <div className="space-y-8">
          {grouped.map(
            ({ layer, items }) =>
              items.length > 0 && (
                <div key={layer}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full" style={{ background: LAYER_META[layer].color }} />
                    <p className="text-sm font-semibold font-display" style={{ color: 'var(--text-primary)' }}>
                      {LAYER_META[layer].label}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      · {LAYER_META[layer].desc}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {items.map((d, i) => (
                      <motion.button
                        key={d.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        whileHover={{ y: -2 }}
                        onClick={() => setSelected(d)}
                        className="text-left bh-card p-4"
                      >
                        <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                          {d.name}
                        </p>
                        <p className="text-xs font-mono-num mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                          {d.table_name}
                        </p>
                        <div className="flex items-center justify-between mt-3">
                          <p className="text-lg font-bold font-mono-num" style={{ color: LAYER_META[layer].color }}>
                            {(d.row_count ?? 0).toLocaleString('en-US')}
                          </p>
                          <p className="text-[10.5px]" style={{ color: 'var(--text-tertiary)' }}>
                            rows
                          </p>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>
              )
          )}
        </div>
      )}

      {selected && <DatasetPreviewModal dataset={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function DatasetPreviewModal({ dataset, onClose }) {
  const [schema, setSchema] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getDatasetSchema(dataset.id), previewDataset(dataset.id, 50)])
      .then(([s, p]) => {
        setSchema(s)
        setPreview(p)
      })
      .finally(() => setLoading(false))
  }, [dataset.id])

  return (
    <Modal open onClose={onClose} title={dataset.name} width={780}>
      {loading ? (
        <div className="h-40 rounded-xl animate-pulse" style={{ background: 'var(--surface-raised)' }} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {schema.columns.map((c) => (
              <span
                key={c.name}
                className="text-[11px] font-mono-num px-2 py-1 rounded-md"
                style={{ background: 'var(--fill-3)', color: 'var(--text-secondary)' }}
              >
                {c.name} <span style={{ color: 'var(--text-tertiary)' }}>· {c.type.toLowerCase()}</span>
              </span>
            ))}
          </div>
          <ResultsTable data={preview} maxHeight={420} />
        </div>
      )}
    </Modal>
  )
}
