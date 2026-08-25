import { useEffect, useRef, useState } from 'react'
import { Camera } from 'lucide-react'

/**
 * What the browser offers for reading a bar code, as far as this component uses it.
 *
 * <p>Declared here rather than pulled in as a type package: `BarcodeDetector` is not in the
 * DOM library yet, and one interface with two members is cheaper than a dependency.
 */
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>
}

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[]
}) => BarcodeDetectorLike

/** How often the picture is looked at. Four times a second is enough for a printed label. */
const INTERVAL = 250

/**
 * How many looks the same code is ignored for after it was read.
 *
 * <p>Only for an overlay that stays open: a label held in front of the camera is read four
 * times a second, and without this every piece would arrive a dozen times. Two seconds is
 * long enough to move the next label into the picture and short enough to read the same
 * number twice on purpose.
 */
const REPEAT_AFTER = 8

/**
 * Reads a bar code with the camera and hands the string to the caller.
 *
 * <p>Knows no domain: it delivers what it read and leaves the reading of it to whoever asked.
 * A code nothing matches is the caller's problem to word.
 *
 * <p>Built on the browser's own `BarcodeDetector`, without a new dependency. Where the
 * interface is missing — today above all iPhone and Firefox — the button is **not rendered at
 * all**: a greyed out control that explains itself only after a click is worse than no
 * control, and a hand scanner types into the field anyway.
 *
 * <p>The camera is asked for on the click, never on load. A refusal takes the button away for
 * this session and says once how it comes back.
 *
 * <p>With `continuous` the overlay stays open and reads one label after the other. That is for
 * the serial numbers of a receipt, where opening the camera again for every piece costs a grab
 * each time and typing them is what one is trying to avoid.
 */
export function BarcodeScanner({
  label = 'Mit der Kamera scannen',
  continuous = false,
  onScan,
  onClose,
}: {
  /** What the button says to a screen reader. */
  label?: string
  /**
   * Keeps the overlay open after a code was read, for capturing one number after the other.
   *
   * <p>The same code is then ignored for about two seconds, so a label left in the picture
   * arrives once rather than four times a second.
   */
  continuous?: boolean
  /** Called with the string that was read; without `continuous` the overlay closes first. */
  onScan: (code: string) => void
  /** Called after the overlay closed, so the caller can put the focus back. */
  onClose?: () => void
}) {
  const [supported] = useState(() => detector() !== undefined)
  const [open, setOpen] = useState(false)
  const [refused, setRefused] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [read, setRead] = useState(0)
  // Read from the reading loop, which is built once per opening: a state value would be the
  // one captured when the loop started.
  const keepsOpen = useRef(continuous)
  useEffect(() => {
    keepsOpen.current = continuous
  }, [continuous])
  const video = useRef<HTMLVideoElement>(null)
  // Held in a ref so the reading loop below does not have to be torn down and rebuilt every
  // time the caller renders with a new inline handler.
  const deliver = useRef(onScan)
  useEffect(() => {
    deliver.current = onScan
  }, [onScan])

  const close = () => {
    setOpen(false)
    onClose?.()
  }

  useEffect(() => {
    if (!open) return
    const Detector = detector()
    if (Detector === undefined) return

    let stream: MediaStream | null = null
    let timer: number | undefined
    let stopped = false
    let looks = 0
    let last: { code: string; at: number } | null = null
    const reader = new Detector({ formats: ['ean_13', 'ean_8', 'code_128', 'qr_code'] })

    const stop = () => {
      stopped = true
      if (timer !== undefined) window.clearInterval(timer)
      stream?.getTracks().forEach((track) => track.stop())
    }

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        if (video.current) {
          video.current.srcObject = stream
          try {
            await video.current.play()
          } catch {
            // A browser that refuses to autoplay still paints the stream, and a test
            // environment has no video pipeline at all. Neither stops the reading below.
          }
        }
        timer = window.setInterval(() => {
          looks += 1
          if (!video.current) return
          void reader
            .detect(video.current)
            .then((codes) => {
              const found = codes[0]?.rawValue
              if (found === undefined || found === '') return
              if (!keepsOpen.current) {
                stop()
                setOpen(false)
                deliver.current(found)
                onClose?.()
                return
              }
              if (last !== null && last.code === found && looks - last.at < REPEAT_AFTER) return
              last = { code: found, at: looks }
              setRead((counted) => counted + 1)
              deliver.current(found)
            })
            .catch(() => undefined)
        }, INTERVAL)
      } catch {
        // A refusal and a camera that is not there look the same from here, and both mean
        // the same for this session: the button goes away.
        setRefused(true)
        setFailure(
          'Die Kamera wurde nicht freigegeben. Erlauben Sie den Zugriff in den ' +
            'Browsereinstellungen und laden Sie die Maske neu.',
        )
        setOpen(false)
      }
    })()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Stopped here rather than let through: the scanner sits inside a dialog, and one
      // Escape must close the overlay, not the whole booking.
      event.stopPropagation()
      stop()
      setOpen(false)
      onClose?.()
    }
    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      stop()
    }
    // onClose is deliberately not a dependency: a caller building it inline would tear the
    // camera down and start it again on every keystroke in the dialog behind.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!supported) return null

  if (refused) {
    return (
      <p role="status" className="text-[12px] text-text-secondary">
        {failure}
      </p>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setRead(0)
          setOpen(true)
        }}
        aria-label={label}
        title={label}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-line text-text-secondary transition-colors hover:bg-sunken hover:text-text-primary"
      >
        <Camera size={16} aria-hidden />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-ink/80 p-4">
          <video
            ref={video}
            muted
            playsInline
            aria-label="Kamerabild"
            className="max-h-[60vh] w-full max-w-[480px] rounded-[var(--radius-md)] border border-line bg-ink object-cover"
          />
          <p className="text-[13px] text-inverse">Strichcode vor die Kamera halten.</p>
          {continuous && (
            <p aria-live="polite" className="text-[13px] text-inverse">
              {read === 0
                ? 'Eine Nummer nach der anderen. Das Fenster bleibt offen.'
                : `${read} ${read === 1 ? 'Nummer' : 'Nummern'} erfasst.`}
            </p>
          )}
          <button
            type="button"
            onClick={close}
            className="rounded-[var(--radius-sm)] border border-line bg-surface px-3 py-1.5 text-[13px] text-text-primary"
          >
            {continuous && read > 0 ? 'Fertig' : 'Abbrechen'}
          </button>
        </div>
      )}
    </>
  )
}

/**
 * The browser's bar code reader, where it has one.
 *
 * @returns the constructor, or `undefined` where the interface is missing
 */
function detector(): BarcodeDetectorConstructor | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector
}
