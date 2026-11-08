export default function EmptyState({ icon: Icon, title, action }) {
  return (
    <div className="text-center py-20" style={{ color: 'var(--text-tertiary)' }}>
      {Icon && <Icon size={30} className="mx-auto mb-3 opacity-30" />}
      <p className="mb-3 text-sm">{title}</p>
      {action}
    </div>
  )
}
