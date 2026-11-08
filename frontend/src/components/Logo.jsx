export default function Logo({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <rect width="100" height="100" rx="14" fill="var(--accent)" />
      <path
        d="M32 70V30h21a11 11 0 0 1 0 22H34M32 52h22a10 10 0 0 1 0 20H32"
        stroke="var(--on-accent)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
