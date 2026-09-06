import { useRef, useState } from 'react'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice, WarningNotice } from '../../components/Notice'
import { TextAreaField } from '../../components/TextAreaField'
import { formatDate } from '../../lib/format'
import type { ClosingEntry } from '../../lib/types'

/**
 * How long a reason may be here.
 *
 * <p>Not the width of the column. The reason becomes «Storno zu 2026-000045: …» in the
 * Buchungstext of every counter entry, a `VARCHAR(200)`, so the room left depends on how long
 * that journal number is — 177 characters for the shipped format. 170 is safe for a journal
 * number of up to eighteen characters; the exact room is checked again in the backend, where the
 * number is known, so a longer format later answers with a sentence rather than with a database
 * error. The same figure stands in `ReopenBody.REASON_LIMIT`.
 */
const REASON_LIMIT = 170

/**
 * «Geschäftsjahr wieder öffnen»: the one move of the bookkeeping that asks for a reason.
 *
 * <p><b>Nothing is deleted.</b> The two closing entries and the opening entry of the following
 * year stay in the journal and each gets a counter entry beside it — that is what a reopened year
 * looks like, and it is exactly what a revision has to be able to see (OR Art. 958f, GeBüV
 * Art. 3). The dialog names them one by one before it asks, because «wieder öffnen» sounds like
 * undoing and is not: what it writes is three more entries, not three fewer.
 *
 * <p><b>The reason is compulsory here and in the backend.</b> It goes into the trail of the year
 * and into the text of each counter entry, and it is what explains ten years later why this year
 * was closed twice. The button stays off while the field is empty rather than answering 400 to a
 * click somebody could have been spared.
 *
 * <p><b>A later year that is not open replaces the whole dialog with a notice.</b> The backend
 * refuses in that case — the counter entries would land in a year that takes none — and it
 * refuses for a locked later year exactly as for a closed one. Asking for a reason first and
 * throwing it away afterwards would be the rudest possible way of saying so.
 */
export function ReopenDialog({
  open,
  yearLabel,
  entries,
  blockedBy,
  onOpenBlockedYear,
  busy,
  error,
  onReopen,
  onClose,
}: {
  open: boolean
  /** What the year is called, for the sentence and for the title. */
  yearLabel: string
  /**
   * The entries of the run that still stand; each of them gets a counter entry — three after an
   * ordinary close.
   */
  entries: readonly ClosingEntry[]
  /**
   * The later year in the way, absent where every later year stands open.
   *
   * <p>Set, it replaces everything the dialog would otherwise ask: the list, the reason and the
   * button. `message` is the sentence the backend refuses with, word for word.
   */
  blockedBy?: { label: string; message: string }
  /** Leads to that later year, so it can be opened first. */
  onOpenBlockedYear?: () => void
  busy: boolean
  error: unknown
  onReopen: (reason: string) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)
  const said = reason.trim()
  const tooLong = said.length > REASON_LIMIT
  const ready = said !== '' && !tooLong && blockedBy === undefined

  const reopen = () => {
    if (!ready || busy) return
    onReopen(said)
  }

  const close = () => {
    setReason('')
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={`Geschäftsjahr ${yearLabel} wieder öffnen`}
      description={
        blockedBy === undefined
          ? 'Der Abschluss wird zurückgenommen, nicht gelöscht.'
          : 'Ein späteres Geschäftsjahr steht im Weg.'
      }
      onSubmit={reopen}
      initialFocus={blockedBy === undefined ? field : undefined}
      footer={
        blockedBy === undefined ? (
          <>
            <Button variant="secondary" onClick={close}>
              Abbrechen
            </Button>
            <Button onClick={reopen} disabled={!ready} busy={busy} shortcut>
              Wieder öffnen
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={close}>
            Schliessen
          </Button>
        )
      }
    >
      {blockedBy !== undefined ? (
        <WarningNotice>
          {blockedBy.message}{' '}
          {onOpenBlockedYear !== undefined && (
            <button
              type="button"
              className="text-accent-text underline underline-offset-2"
              onClick={() => {
                setReason('')
                onOpenBlockedYear()
              }}
            >
              {`Geschäftsjahr ${blockedBy.label} öffnen`}
            </button>
          )}
        </WarningNotice>
      ) : (
        <div className="grid gap-4">
          <WarningNotice>
            {entries.length === 1
              ? 'Es wird eine Gegenbuchung geschrieben.'
              : `Es werden ${entries.length} Gegenbuchungen geschrieben.`}
            {' Die ursprünglichen Buchungen bleiben im Journal stehen. Bilanz und'}
            {' Erfolgsrechnung dieses Jahres lesen sich danach wieder wie vor dem Abschluss,'}
            {' und das Folgejahr steht ohne Eröffnungsbilanz da, bis Sie erneut abschliessen.'}
          </WarningNotice>

          {/* Named one by one and not counted. «Drei Gegenbuchungen» says how much happens; the
              journal number and the Buchungstext say what happens, and they are what somebody
              looks for in the journal afterwards. */}
          {entries.length > 0 && (
            <ul className="grid gap-1 text-[13px]">
              {entries.map((entry) => (
                <li key={entry.entryId} className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-mono tabular-nums">{entry.entryNumber}</span>
                  <span className="min-w-0 flex-1">{entry.description}</span>
                  <span className="text-text-secondary">{formatDate(entry.bookingDate)}</span>
                </li>
              ))}
            </ul>
          )}

          <TextAreaField
            ref={field}
            label="Grund"
            rows={3}
            value={reason}
            invalid={tooLong}
            hint={
              tooLong
                ? `Der Grund ist zu lang; ${REASON_LIMIT} Zeichen sind das Höchstmass, weil er zusammen mit «Storno zu 2026-000045: » zum Buchungstext jeder Gegenbuchung wird.`
                : 'Steht im Protokoll des Geschäftsjahres und als Stornogrund an jeder Gegenbuchung.'
            }
            onChange={(event) => setReason(event.target.value)}
          />

          {error !== null && error !== undefined && <ErrorNotice error={error} />}
        </div>
      )}
    </Dialog>
  )
}
