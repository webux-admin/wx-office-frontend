/**
 * Indeterminate progress.
 *
 * <p>Drawn with a CSS animation rather than a motion component: it can run while the main
 * thread is busy, which is exactly when it is on screen.
 *
 * @param label announced to screen readers, and shown next to the ring when `showLabel`
 * @param size  diameter in pixels
 */
export function Spinner({
  label = 'Wird geladen',
  size = 18,
  showLabel = false,
  className = '',
}: {
  label?: string
  size?: number
  showLabel?: boolean
  className?: string
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} role="status">
      <span
        aria-hidden
        className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
        style={{ width: size, height: size }}
      />
      <span className={showLabel ? 'text-text-secondary' : 'sr-only'}>{label}</span>
    </span>
  )
}
