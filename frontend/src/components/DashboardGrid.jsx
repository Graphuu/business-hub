import { motion } from 'framer-motion'
import { GripVertical, Pencil, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import GridLayout, { WidthProvider } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import WidgetRenderer from './WidgetRenderer'

const Grid = WidthProvider(GridLayout)

export default function DashboardGrid({ widgets, editMode, onLayoutSettled, onEditWidget, onDeleteWidget }) {
  const layout = useMemo(
    () =>
      widgets.map((w) => ({
        i: w.id,
        x: w.layout.x ?? 0,
        y: w.layout.y ?? 0,
        w: w.layout.w ?? 4,
        h: w.layout.h ?? 3,
        minW: 2,
        minH: 2,
      })),
    [widgets]
  )

  return (
    <Grid
      className="layout"
      layout={layout}
      cols={12}
      rowHeight={44}
      margin={[16, 16]}
      isDraggable={editMode}
      isResizable={editMode}
      draggableHandle=".bh-widget-drag-handle"
      onDragStop={editMode ? onLayoutSettled : undefined}
      onResizeStop={editMode ? onLayoutSettled : undefined}
      useCSSTransforms
    >
      {widgets.map((w, idx) => (
        <div key={w.id}>
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, delay: Math.min(idx * 0.05, 0.4), ease: [0.16, 1, 0.3, 1] }}
            className="bh-card bh-no-rise h-full flex flex-col overflow-hidden"
            style={{
              boxShadow: editMode ? '0 0 0 1.5px rgba(61,214,163,0.7), var(--shadow-lg)' : undefined,
              transition: 'box-shadow 0.2s ease',
            }}
          >
            <div className="flex items-center justify-between px-4 pt-3.5 pb-1.5 flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                {editMode && (
                  <GripVertical
                    size={13}
                    className="bh-widget-drag-handle cursor-grab flex-shrink-0"
                    style={{ color: 'var(--text-tertiary)' }}
                  />
                )}
                {w.widget_type !== 'kpi' && (
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--text-secondary)' }}>
                    {w.title}
                  </p>
                )}
              </div>
              {editMode && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => onEditWidget(w)} className="p-1 rounded hover:bg-ink/5">
                    <Pencil size={12} style={{ color: 'var(--text-tertiary)' }} />
                  </button>
                  <button onClick={() => onDeleteWidget(w)} className="p-1 rounded hover:bg-ink/5">
                    <Trash2 size={12} style={{ color: 'var(--danger)' }} />
                  </button>
                </div>
              )}
            </div>
            <div className="flex-1 min-h-0 px-4 pb-4 pt-1">
              <WidgetRenderer widget={w} data={w.data} error={w.error} />
            </div>
          </motion.div>
        </div>
      ))}
    </Grid>
  )
}
