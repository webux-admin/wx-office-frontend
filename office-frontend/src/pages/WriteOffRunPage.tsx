import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { Button } from '../components/Button'
import { DataTable, type Column } from '../components/DataTable'
import { Dialog } from '../components/Dialog'
import { EmptyState, ErrorNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { SelectField } from '../components/SelectField'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { MasterDataSelect } from '../masterdata/MasterDataSelect'
import { formatAmount, formatDate, toIsoDate } from '../lib/format'
import {
  OPEN_ITEM_RIGHTS,
  WRITE_OFF_REASONS,
  WRITE_OFF_REASON_HINTS,
  WRITE_OFF_REASON_ORDER,
  fetchWriteOffProposal,
  openItemsKey,
  runWriteOff,
} from '../lib/openItem'
import { receivableKey, salesDocumentFor, salesDocumentListKey } from '../lib/salesDocument'
import type { Partner, WriteOffCandidate, WriteOffReason, WriteOffRunResult } from '../lib/types'
import { PartnerQuickSearch } from './document/PartnerQuickSearch'
import {
  defaultSettings,
  proposalSignature,
  runPayload,
  runResultText,
  selectionCountText,
  selectionTotal,
  toleranceComplaint,
  type RunSettings,
  type ToleranceKind,
} from './openitem/writeOffRun'

/**
 * Giving up many small remainders at once.
 *
 * <p>Two steps, and the second is not the first repeated: the proposal shows what would go,
 * the booking asks the server again. An item that was paid in between comes back as skipped
 * rather than written off — the ticks narrow what is booked, they never decide it (backend
 * ADR-0102).
 *
 * <p><b>The tolerance is either an amount or a percentage.</b> Two fields of which one
 * quietly wins cannot be explained in a confirmation dialog, and the backend refuses the
 * combination anyway.
 */
export function WriteOffRunPage() {
  return (
    <RequireTenant permission={OPEN_ITEM_RIGHTS.read}>
      {(tenantId) => <WriteOffRun tenantId={tenantId} />}
    </RequireTenant>
  )
}

function WriteOffRun({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayRun = can(OPEN_ITEM_RIGHTS.run)
  const invoiceKind = salesDocumentFor('INVOICE')
  const today = toIsoDate()

  const [settings, setSettings] = useState<RunSettings>(() => defaultSettings('', today))
  const [partner, setPartner] = useState<Partner | undefined>(undefined)
  const [partnerTerm, setPartnerTerm] = useState('')
  const [selected, setSelected] = useState<Set<string | number>>(() => new Set())
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<WriteOffRunResult | null>(null)
  // A change to the tolerance, the date or the reason puts a different proposal on screen, so
  // what was ticked before means something else afterwards. Asked about rather than done —
  // the same guard the price entry puts around its typed prices. Held as a thunk.
  const [pending, setPending] = useState<{ run: () => void } | null>(null)

  const complaint = toleranceComplaint(settings, today)
  const body = runPayload(settings)
  const signature = proposalSignature(settings)

  const proposal = useQuery({
    queryKey: ['write-off-proposal', tenantId, signature],
    queryFn: () => fetchWriteOffProposal(tenantId, body),
    enabled: complaint === null && settings.currency !== '',
    placeholderData: keepPreviousData,
  })

  const candidates = proposal.data?.candidates ?? []
  const selectedCount = candidates.filter((row) => selected.has(row.documentId)).length
  const total = selectionTotal(candidates, selected)

  const book = useMutation({
    mutationFn: () =>
      runWriteOff(
        tenantId,
        runPayload(
          settings,
          candidates
            .filter((row) => selected.has(row.documentId))
            .map((row) => row.documentId),
        ),
      ),
    onSuccess: (answer) => {
      setResult(answer)
      setSelected(new Set())
      setConfirming(false)
      void queryClient.invalidateQueries({ queryKey: ['write-off-proposal', tenantId] })
      void queryClient.invalidateQueries({ queryKey: openItemsKey(tenantId) })
      if (invoiceKind) {
        void queryClient.invalidateQueries({
          queryKey: salesDocumentListKey(invoiceKind, tenantId),
        })
        void queryClient.invalidateQueries({ queryKey: receivableKey(invoiceKind, tenantId) })
      }
    },
  })

  /** Runs a change that would give the ticks another meaning — asks first while any stand. */
  const guard = (run: () => void) => {
    if (selected.size === 0) {
      run()
      return
    }
    setPending({ run })
  }

  const change = (next: Partial<RunSettings>) =>
    guard(() => {
      setSettings((current) => ({ ...current, ...next }))
      setSelected(new Set())
      setResult(null)
    })

  const columns: Column<WriteOffCandidate>[] = [
    {
      key: 'partner',
      header: 'Kunde',
      render: (row) => (
        <span className="grid">
          <span>{row.partnerName ?? '–'}</span>
          {row.partnerNumber !== undefined && (
            <span className="text-[12px] text-text-tertiary">{row.partnerNumber}</span>
          )}
        </span>
      ),
    },
    { key: 'number', header: 'Nummer', render: (row) => row.documentNumber ?? '–' },
    {
      key: 'dueDate',
      header: 'Fällig',
      hideBelow: 'sm',
      render: (row) => `${formatDate(row.dueDate)} · ${row.daysOverdue} Tage`,
    },
    {
      key: 'totalGross',
      header: 'Brutto',
      align: 'right',
      hideBelow: 'sm',
      render: (row) => formatAmount(row.totalGross),
    },
    {
      key: 'settled',
      header: 'Eingegangen',
      align: 'right',
      hideBelow: 'sm',
      render: (row) => formatAmount(row.settled),
    },
    {
      key: 'limit',
      header: 'Grenze',
      align: 'right',
      hideBelow: 'sm',
      render: (row) => formatAmount(row.limit),
    },
    {
      key: 'writeOff',
      header: 'Wird ausgebucht',
      align: 'right',
      render: (row) => <span className="font-medium">{formatAmount(row.writeOffAmount)}</span>,
    },
  ]

  return (
    <>
      <PageHeader
        title="Kleindifferenzen ausbuchen"
        subtitle="Restbeträge unter einer Toleranz auf einmal aufgeben. Je Posten entsteht eine eigene Buchung."
      >
        {selectedCount > 0 && (
          <span className="text-[13px] text-text-secondary" aria-live="polite">
            {selectionCountText(selectedCount)}
          </span>
        )}
        {mayRun && (
          <Button onClick={() => setConfirming(true)} disabled={selectedCount === 0}>
            Ausbuchen
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-4 px-8 pb-12">
        {complaint !== null && <ErrorNotice error={new Error(complaint)} />}
        {book.error !== null && <ErrorNotice error={book.error} />}

        {result !== null && (
          <div
            className="grid gap-2 rounded-[var(--radius-md)] border border-line bg-surface px-4 py-3 text-[13px] text-text-secondary"
            aria-live="polite"
          >
            <p className="flex items-center gap-2">
              <Check size={15} className="text-accent-text" aria-hidden />
              {runResultText(result, settings.currency)}
            </p>
            {[...result.skipped, ...result.failed].length > 0 && (
              <ul className="grid gap-1 pl-6 text-[12px] text-text-tertiary">
                {[...result.skipped, ...result.failed].map((entry) => (
                  <li key={entry.documentId}>
                    {entry.documentNumber ?? entry.documentId}: {entry.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <Panel
          title="Toleranz und Buchung"
          description="Gilt für den ganzen Lauf. Eine Änderung stellt einen anderen Vorschlag auf."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SelectField
              label="Toleranzart"
              value={settings.toleranceKind}
              onChange={(event) =>
                change({ toleranceKind: event.target.value as ToleranceKind })
              }
              hint="Entweder ein Betrag oder ein Prozentsatz, nie beides."
            >
              <option value="AMOUNT">Betrag</option>
              <option value="PERCENT">Prozent</option>
            </SelectField>

            {settings.toleranceKind === 'AMOUNT' ? (
              <TextField
                label="Bis Betrag"
                value={settings.amount}
                onChange={(event) => change({ amount: event.target.value })}
                inputMode="decimal"
                numeric
                hint="Derselbe Betrag auf jedem Posten."
              />
            ) : (
              <TextField
                label="Bis Prozent"
                value={settings.percent}
                onChange={(event) => change({ percent: event.target.value })}
                inputMode="decimal"
                numeric
                hint="Gemessen an dem, was auf der Rechnung tatsächlich eingegangen ist — nicht am Belegtotal."
              />
            )}

            <MasterDataSelect
              label="Währung"
              tenantId={tenantId}
              list="currencies"
              value={settings.currency}
              onChange={(code) => change({ currency: code })}
              hint="Ein Lauf trägt genau eine Währung."
            />

            <TextField
              label="Buchungsdatum"
              type="date"
              max={today}
              value={settings.bookingDate}
              onChange={(event) => change({ bookingDate: event.target.value })}
              hint="Die Periode der MWST-Korrektur."
            />

            <SelectField
              label="Grund"
              value={settings.reason}
              onChange={(event) => change({ reason: event.target.value as WriteOffReason })}
              hint={WRITE_OFF_REASON_HINTS[settings.reason]}
            >
              {WRITE_OFF_REASON_ORDER.map((code) => (
                <option key={code} value={code}>
                  {WRITE_OFF_REASONS[code]}
                </option>
              ))}
            </SelectField>

            <TextField
              label="Mindestalter in Tagen"
              value={settings.minimumAgeDays}
              onChange={(event) => change({ minimumAgeDays: event.target.value })}
              inputMode="numeric"
              numeric
              hint="Ab Fälligkeit. Eine Rechnung ohne Fälligkeitsdatum bleibt aussen vor."
            />

            <span className="grid gap-1">
              <PartnerQuickSearch
                tenantId={tenantId}
                term={partnerTerm}
                onTerm={(next) => {
                  setPartnerTerm(next)
                  if (next === '') change({ partnerId: undefined })
                }}
                chosen={partner !== undefined}
                onChoose={(chosen) => {
                  setPartner(chosen)
                  change({ partnerId: chosen.id })
                }}
              />
            </span>
          </div>
        </Panel>

        <Panel padded={false} title="Vorschlag">
          {proposal.data !== undefined && (
            <div className="flex flex-wrap gap-x-8 gap-y-3 px-5 pb-4">
              <Figure label="Posten" value={String(proposal.data.count)} />
              <Figure
                label="Summe"
                value={`${formatAmount(proposal.data.total)} ${proposal.data.currency}`}
              />
              <Figure
                label="Grösster Einzelbetrag"
                value={`${formatAmount(proposal.data.largestWriteOff)} ${proposal.data.currency}`}
              />
              <Figure
                label="Markiert"
                value={`${selectedCount} · ${formatAmount(total)} ${proposal.data.currency}`}
              />
            </div>
          )}

          <DataTable
            columns={columns}
            rows={candidates}
            keyOf={(row) => row.documentId}
            loading={proposal.isPending && settings.currency !== ''}
            error={proposal.error}
            empty={
              <EmptyState
                title="Nichts unter der Toleranz"
                description="Keine Rechnung liegt unter der eingestellten Grenze — oder das Mindestalter ist noch nicht erreicht."
              />
            }
            selected={mayRun ? selected : undefined}
            onSelectedChange={mayRun ? setSelected : undefined}
            selectionLabel={(row) =>
              `Rechnung ${row.documentNumber ?? row.documentId} markieren`
            }
          />
        </Panel>

        {!mayRun && (
          <p className="text-[13px] text-text-secondary">
            Zum Ausbuchen im Stapel fehlt das Recht «Kleindifferenzen ausbuchen».
          </p>
        )}
      </div>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Ausbuchen bestätigen"
        description="Je Posten entsteht eine eigene Ausgleichszeile und ein eigener Vorgang. Ein gebuchter Lauf lässt sich nicht mehr ändern."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Abbrechen
            </Button>
            <Button onClick={() => book.mutate()} busy={book.isPending}>
              Jetzt ausbuchen
            </Button>
          </>
        }
      >
        <div className="grid gap-2 text-[13px] text-text-secondary">
          <p>
            <strong className="text-text-primary">{selectionCountText(selectedCount)}</strong>,
            zusammen {formatAmount(total)} {settings.currency}.
          </p>
          <p>
            Grund: {WRITE_OFF_REASONS[settings.reason]} · Buchungsdatum{' '}
            {formatDate(settings.bookingDate)}.
          </p>
          <p className="text-[12px] text-text-tertiary">
            Der Vorschlag wird beim Buchen neu gerechnet. Ein Posten, auf den inzwischen eine
            Zahlung eingegangen ist, wird übersprungen und nicht ausgebucht.
          </p>
        </div>
      </Dialog>

      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Markierung verwerfen?"
        description={`${selectionCountText(selectedCount)}, aber noch nicht gebucht. Toleranz, Datum und Grund gelten für den ganzen Lauf — wer sie jetzt ändert, bekommt einen anderen Vorschlag.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>
              Zurück
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                pending?.run()
                setPending(null)
              }}
            >
              Verwerfen und ändern
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-text-secondary">
          Zuerst ausbuchen behält alles: der Lauf läuft danach mit den neuen Einstellungen
          weiter.
        </p>
      </Dialog>
    </>
  )
}

/** One figure of the proposal head. */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <p className="text-[12px] text-text-tertiary">{label}</p>
      <p className="text-[13px]">{value}</p>
    </div>
  )
}
