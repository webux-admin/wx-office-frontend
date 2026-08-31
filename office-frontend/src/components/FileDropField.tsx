import { useId, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { formatByteCount } from '../lib/format'

/** What the field needs to know. */
export type FileDropFieldProps = {
  label: string
  /** What the picker offers, e.g. `.xml,application/xml`. */
  accept?: string
  /** Largest file taken, in bytes. Checked here so nothing travels that cannot land. */
  maxBytes?: number
  /** A sentence under the box: what kind of file is wanted. */
  hint?: string
  disabled?: boolean
  /** Called with the chosen file, or with `null` when it was taken back. */
  onSelect: (file: File | null) => void
  /** What is wrong with the choice, from outside — a rejected upload, for example. */
  error?: string
}

/**
 * A field that takes one file, by dropping it or by picking it.
 *
 * <p>Both ways, and neither instead of the other: dropping is what somebody does who already
 * has the file manager open beside the browser, and picking is what everybody else does — and
 * what a keyboard reaches. A drop zone alone would be a field some people cannot use.
 *
 * <p>The hidden `input` is the field and the visible box is its label. That keeps the keyboard
 * and the screen reader on the real control instead of on a `div` wearing a `role`.
 */
export function FileDropField({
  label,
  accept,
  maxBytes,
  hint,
  disabled = false,
  onSelect,
  error,
}: FileDropFieldProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [chosen, setChosen] = useState<File | null>(null)
  const [ownError, setOwnError] = useState<string | undefined>(undefined)

  const message = error ?? ownError

  function take(file: File | null) {
    if (file && maxBytes !== undefined && file.size > maxBytes) {
      // Refused here rather than at the server: the file would travel for a minute only to be
      // turned away, and on a mobile connection that is a minute of somebody's data.
      setOwnError(`Die Datei ist grösser als ${Math.round(maxBytes / (1024 * 1024))} MB`)
      setChosen(null)
      onSelect(null)
      return
    }
    setOwnError(undefined)
    setChosen(file)
    onSelect(file)
  }

  function clear() {
    // The input keeps its value, and without this the same file picked twice in a row fires
    // no change event at all.
    if (inputRef.current) inputRef.current.value = ''
    take(null)
  }

  return (
    <div className="grid gap-1.5">
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled) setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setOver(false)
          if (disabled) return
          // Only the first one. A second file would silently replace it, and the field says
          // «eine Datei».
          take(event.dataTransfer.files?.[0] ?? null)
        }}
        className={[
          'grid justify-items-center gap-1.5 rounded-[var(--radius-md)] border border-dashed px-6 py-8 text-center transition-colors',
          disabled
            ? 'cursor-not-allowed border-line bg-sunken text-text-tertiary'
            : over
              ? 'cursor-pointer border-accent bg-accent/8 text-accent-text'
              : 'cursor-pointer border-line text-text-secondary hover:border-accent',
        ].join(' ')}
      >
        <Upload size={19} aria-hidden />
        <span className="text-[13px] font-medium text-text-primary">{label}</span>
        {chosen ? (
          <span className="text-[13px] text-text-primary">
            {chosen.name} · {formatByteCount(chosen.size)}
          </span>
        ) : (
          hint && <span className="text-[12px] text-text-tertiary">{hint}</span>
        )}
      </label>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => take(event.target.files?.[0] ?? null)}
      />

      {chosen && !disabled && (
        <button
          type="button"
          className="justify-self-start text-[12px] text-text-secondary underline transition-colors hover:text-text-primary"
          onClick={clear}
        >
          Auswahl aufheben
        </button>
      )}

      {message && (
        <p role="alert" className="text-[12px] text-danger">
          {message}
        </p>
      )}
    </div>
  )
}
