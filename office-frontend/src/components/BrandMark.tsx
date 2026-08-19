/**
 * The webux ERP logo: four tiles, one of them accented.
 *
 * <p>Redrawn as SVG rather than imported as an asset so it inherits the text colour and
 * stays crisp on the dark panel and on the light card alike.
 *
 * @param size edge length in pixels
 */
export function BrandMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      role="img"
      aria-label="webux ERP"
      className={className}
    >
      <rect width="28" height="28" rx="7" className="fill-accent" />
      <rect x="7" y="7" width="6" height="6" rx="1.6" fill="currentColor" opacity="0.55" />
      <rect x="15" y="7" width="6" height="6" rx="1.6" fill="currentColor" />
      <rect x="7" y="15" width="6" height="6" rx="1.6" fill="currentColor" />
      <rect x="15" y="15" width="6" height="6" rx="1.6" fill="currentColor" opacity="0.55" />
    </svg>
  )
}
