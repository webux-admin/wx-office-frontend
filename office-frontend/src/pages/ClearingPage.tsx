import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { CheckboxField } from '../components/CheckboxField'
import { Dialog } from '../components/Dialog'
import { MatchGrid, type GridColumn } from '../components/MatchGrid'
import { EmptyState, ErrorNotice, WarningNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { SelectField } from '../components/SelectField'
import { TextField } from '../components/TextField'
import { Tabs } from '../components/Tabs'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { formatAmount, formatDate } from '../lib/format'
import { BANKING_MODULE, referenceLabel } from '../lib/banking'
import { CONFIDENCE_NAMES, CONFIDENCE_TONES } from '../lib/matching'
import {
  CLEARING_RIGHTS,
  OUTCOME_NAMES,
  assignTransaction,
  fetchDunningConflicts,
  fetchMatchRunProposal,
  fetchWorklist,
  fetchWorklistCount,
  mayBook,
  markToCheck,
  remainderOf,
  runMatch,
  withdrawAssignment,
  worklistCountKey,
  worklistKey,
} from '../lib/clearing'
import type {
  AssignmentLine,
  Confidence,
  MatchRunResult,
  WorklistRow,
} from '../lib/types'

/** The three tabs under the settlement lines. */
type TabId = 'vorschlaege' | 'offene' | 'sonstiges'

/**
 * The clearing basket: what the bank sent and nobody has assigned yet.
 *
 * <p><b>Three steps, freely combined</b> — the answer to «entweder vor oder nach den anderen
 * Zahlungen»: the collective action takes over what is safe, and the rest stays here. Whoever
 * wants clears the doubtful ones first and takes the safe ones afterwards; whoever wants does
 * it the other way round (backend ADR-0109).
 *
 * <p><b>The free text is shown in full.</b> Somebody often decides on exactly the text no
 * automation understood — «Rg 4711 + 4712 abzgl. Retoure» — and a truncated field forces a trip
 * into the e-banking, which costs the selection, the scroll position and the keyboard flow
 * (ADR-0043).
 *
 * <p><b>The book button frees only when the difference is nil</b> or somebody deliberately
 * chose what happens to the rest. «Erst gleich, dann buchbar.»
 */
export function ClearingPage() {
  return (
    <RequireTenant permission={CLEARING_RIGHTS.read} module={BANKING_MODULE}>
      {(tenantId) => <Clearing tenantId={tenantId} />}
    </RequireTenant>
  )
}

function Clearing({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayAssign = can(CLEARING_RIGHTS.assign)
  const mayRun = can(CLEARING_RIGHTS.run)

  const [onlyToCheck, setOnlyToCheck] = useState(false)
  const [confidence, setConfidence] = useState<'' | Confidence>('')
  const [openId, setOpenId] = useState<number | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [lines, setLines] = useState<AssignmentLine[]>([])
  const [restHandled, setRestHandled] = useState(false)
  const [tab, setTab] = useState<TabId>('vorschlaege')
  const [announcement, setAnnouncement] = useState('')
  const [runDialog, setRunDialog] = useState(false)
  const [runResult, setRunResult] = useState<MatchRunResult | null>(null)
  const [withdrawing, setWithdrawing] = useState<WorklistRow | null>(null)

  const query = {
    state: 'NEW',
    toCheck: onlyToCheck ? true : undefined,
    confidence: confidence === '' ? undefined : confidence,
    size: 200,
  }

  const worklist = useQuery({
    queryKey: worklistKey(tenantId, JSON.stringify(query)),
    queryFn: () => fetchWorklist(tenantId, query),
  })

  const counts = useQuery({
    queryKey: worklistCountKey(tenantId),
    queryFn: () => fetchWorklistCount(tenantId),
  })

  const rows = worklist.data ?? []
  const open = rows.find((row) => row.id === openId) ?? null
  const safeCount = rows.filter((row) => row.safe).length
  const remainder = open === null ? 0 : remainderOf(open.amount, lines)

  function openRow(row: WorklistRow) {
    setOpenId(row.id)
    setRestHandled(false)
    setTab('vorschlaege')
    // Prefilled from the cascade — and only where it had one answer. Where several stand,
    // nothing is preselected and the mask says so.
    setLines(
      row.bestDocumentId !== undefined && row.proposalCount === 1
        ? [{ documentId: row.bestDocumentId, amount: row.amount }]
        : [],
    )
  }

  const assign = useMutation({
    mutationFn: () =>
      assignTransaction(tenantId, openId ?? 0, { lines, note: undefined }),
    onSuccess: (written) => {
      setAnnouncement(`${written.length} Ausgleichszeile(n) gebucht`)
      setOpenId(null)
      setLines([])
      void queryClient.invalidateQueries({ queryKey: worklistKey(tenantId) })
      void queryClient.invalidateQueries({ queryKey: worklistCountKey(tenantId) })
    },
  })

  const check = useMutation({
    mutationFn: (row: WorklistRow) =>
      markToCheck(tenantId, row.id, !row.toCheck, row.toCheck ? undefined : 'Später klären'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: worklistKey(tenantId) })
      void queryClient.invalidateQueries({ queryKey: worklistCountKey(tenantId) })
    },
  })

  function nextUnclear(from: WorklistRow) {
    const index = rows.findIndex((row) => row.id === from.id)
    const next = rows.slice(index + 1).find((row) => !row.safe)
    if (next !== undefined) {
      openRow(next)
      setAnnouncement(`Nächster ungeklärter Posten: ${formatAmount(next.amount)}`)
    }
  }

  function onShortcut(key: string, row: WorklistRow) {
    if (key === 'Enter') {
      openRow(row)
      return
    }
    if (key === 'Ctrl+Enter' && mayAssign && openId === row.id
        && mayBook(remainder, restHandled)) {
      assign.mutate()
      return
    }
    if (key === 'S') {
      check.mutate(row)
      return
    }
    if (key === 'N') {
      nextUnclear(row)
    }
  }

  const columns: GridColumn<WorklistRow>[] = [
    {
      key: 'valueDate',
      header: 'Valuta',
      width: 'w-[92px]',
      render: (row) => formatDate(row.valueDate),
    },
    {
      key: 'amount',
      header: 'Betrag',
      align: 'right',
      width: 'w-[110px]',
      render: (row) => formatAmount(row.amount),
    },
    {
      key: 'payer',
      header: 'Zahler',
      render: (row) => row.debtorName ?? '-',
    },
    {
      key: 'confidence',
      header: 'Konfidenz',
      width: 'w-[132px]',
      render: (row) => (
        <span className="flex flex-wrap items-center gap-1">
          {row.bestConfidence !== undefined ? (
            <Badge tone={CONFIDENCE_TONES[row.bestConfidence]}>
              {CONFIDENCE_NAMES[row.bestConfidence]}
            </Badge>
          ) : (
            <Badge tone="muted">kein Vorschlag</Badge>
          )}
          {row.toCheck && <Badge tone="accent">später</Badge>}
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Klärung"
        subtitle="Was die Bank geschickt hat und noch keiner Rechnung zugeordnet ist. Grosse Beträge zuerst."
      >
        {mayRun && safeCount > 0 && (
          <Button onClick={() => setRunDialog(true)}>
            Alle sicheren übernehmen ({safeCount})
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-4 px-8 pb-12">
        {/* Announced politely, never assertively: assertive interrupts the running output and
            is reserved for real errors (WCAG 4.1.3). */}
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>

        {runResult !== null && (
          <Panel title="Ergebnis des Laufs">
            <p className="text-[13px]">
              {runResult.posted.length} gebucht über{' '}
              {formatAmount(runResult.postedAmount)} {runResult.currencyCode},{' '}
              {runResult.skipped.length} übersprungen, {runResult.failed.length} fehlgeschlagen.
            </p>
            {[...runResult.skipped, ...runResult.failed].length > 0 && (
              <ul className="mt-3 grid gap-1 text-[13px] text-text-secondary">
                {[...runResult.skipped, ...runResult.failed].map((line) => (
                  <li key={`${line.outcome}-${line.transactionId}`}>
                    <strong>{OUTCOME_NAMES[line.outcome]}:</strong> {line.message}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3">
              <Button variant="secondary" onClick={() => setRunResult(null)}>
                Schliessen
              </Button>
            </div>
          </Panel>
        )}

        <div className="flex flex-wrap items-end gap-4">
          <span className="w-full max-w-[200px]">
            <SelectField
              label="Konfidenz"
              value={confidence}
              onChange={(event) => setConfidence(event.target.value as '' | Confidence)}
            >
              <option value="">Alle</option>
              {(['HOCH', 'MITTEL', 'TIEF'] as Confidence[]).map((code) => (
                <option key={code} value={code}>
                  {CONFIDENCE_NAMES[code]}
                </option>
              ))}
            </SelectField>
          </span>
          <CheckboxField
            label={`Nur später zu klären (${counts.data?.toCheck ?? 0})`}
            checked={onlyToCheck}
            onChange={(event) => setOnlyToCheck(event.target.checked)}
          />
          <p className="text-[12px] text-text-tertiary">
            Tastatur: <strong>Enter</strong> öffnen · <strong>Ctrl+Enter</strong> buchen ·{' '}
            <strong>S</strong> später klären · <strong>N</strong> nächster ungeklärter
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(320px,2fr)_3fr]">
          <Panel padded={false} title={`Eingänge (${rows.length})`}>
            {worklist.error !== null ? (
              <ErrorNotice error={worklist.error} />
            ) : (
              <MatchGrid
                columns={columns}
                rows={rows}
                keyOf={(row) => row.id}
                label="Nicht zugeordnete Bankeingänge"
                activeId={openId ?? undefined}
                onActivate={openRow}
                selected={selected}
                onSelectedChange={(next) => {
                  setSelected(next)
                  setAnnouncement(`${next.length} Zeilen ausgewählt`)
                }}
                onShortcut={onShortcut}
                empty={
                  <EmptyState
                    title="Nichts zu klären"
                    description="Jeder eingelesene Eingang ist zugeordnet."
                  />
                }
              />
            )}
          </Panel>

          {open === null ? (
            <Panel title="Kein Eingang gewählt">
              <p className="text-[13px] text-text-secondary">
                Wählen Sie links einen Eingang, um seine Rohdaten und die Vorschläge zu sehen.
              </p>
            </Panel>
          ) : (
            <div className="grid gap-4">
              <Panel title={`${formatAmount(open.amount)} ${open.currencyCode}`}>
                <dl className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-3">
                  <Figure label="Valuta">{formatDate(open.valueDate)}</Figure>
                  <Figure label="Zahler">{open.debtorName ?? '-'}</Figure>
                  <Figure label="Zahlerkonto">{open.debtorIban ?? '-'}</Figure>
                  <Figure label="Referenz">{referenceLabel(open)}</Figure>
                  <Figure label="Konto">{open.accountIban}</Figure>
                  <Figure label="Buchung">{formatDate(open.bookingDate)}</Figure>
                </dl>
                {open.reference && (
                  <p className="mt-3 font-mono text-[12px]">{open.reference}</p>
                )}
                {/* In full, never shortened: the text nobody automated is what decides. */}
                {open.remittanceUnstructured && (
                  <p className="mt-3 whitespace-pre-wrap rounded-[var(--radius-md)] bg-sunken p-3 text-[13px]">
                    {open.remittanceUnstructured}
                  </p>
                )}
                {open.toCheck && open.toCheckNote && (
                  <p className="mt-3 text-[13px] text-text-secondary">
                    Später klären: {open.toCheckNote}
                  </p>
                )}
              </Panel>

              <Panel title="Zuordnung">
                {lines.length === 0 ? (
                  <p className="text-[13px] text-text-secondary">
                    {open.proposalCount > 1
                      ? 'Mehrere Kombinationen möglich — es ist nichts vorgewählt.'
                      : 'Noch nichts gesetzt.'}
                  </p>
                ) : (
                  <ul className="grid gap-2">
                    {lines.map((line, index) => (
                      <li key={line.documentId} className="flex items-center gap-3">
                        <span className="flex-1 text-[13px]">
                          {open.bestDocumentNumber ?? `Beleg ${line.documentId}`}
                        </span>
                        <span className="w-[140px]">
                          <TextField
                            label="Teilbetrag"
                            numeric
                            value={String(line.amount)}
                            onChange={(event) =>
                              setLines(
                                lines.map((one, position) =>
                                  position === index
                                    ? { ...one, amount: Number(event.target.value.replace(',', '.')) }
                                    : one,
                                ),
                              )
                            }
                          />
                        </span>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            setLines(lines.filter((_, position) => position !== index))
                          }
                        >
                          Entfernen
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Always visible, and the reason the button is locked. */}
                <div
                  className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] px-3 py-2 text-[14px] font-medium ${
                    Math.abs(remainder) < 0.005
                      ? 'bg-success/14 text-success'
                      : 'bg-danger/14 text-danger'
                  }`}
                >
                  <span>Restdifferenz {formatAmount(remainder)} {open.currencyCode}</span>
                  {Math.abs(remainder) >= 0.005 && (
                    <CheckboxField
                      label="Rest bewusst offen lassen"
                      checked={restHandled}
                      onChange={(event) => setRestHandled(event.target.checked)}
                    />
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {mayAssign && (
                    <Button
                      onClick={() => assign.mutate()}
                      disabled={lines.length === 0 || !mayBook(remainder, restHandled)}
                      busy={assign.isPending}
                    >
                      Buchen
                    </Button>
                  )}
                  <Button variant="secondary" onClick={() => check.mutate(open)}>
                    {open.toCheck ? 'Nicht mehr später klären' : 'Später klären'}
                  </Button>
                  {mayAssign && open.state !== 'NEW' && (
                    <Button variant="secondary" onClick={() => setWithdrawing(open)}>
                      Zuordnung zurücknehmen
                    </Button>
                  )}
                </div>
                {assign.error !== null && (
                  <div className="mt-3">
                    <ErrorNotice error={assign.error} />
                  </div>
                )}
              </Panel>

              <Panel padded={false} title="Woher der Vorschlag kommt">
                <div className="px-5">
                  <Tabs
                    tabs={[
                      { id: 'vorschlaege', label: `Vorschläge (${open.proposalCount})` },
                      { id: 'offene', label: 'Offene Posten' },
                      { id: 'sonstiges', label: 'Sonstiges' },
                    ]}
                    active={tab}
                    onChange={setTab}
                    label="Woher der Vorschlag kommt"
                  />
                  {tab === 'vorschlaege' && (
                    <p className="pb-5 text-[13px] text-text-secondary">
                      {open.bestReason ?? 'Die Kaskade hat zu diesem Eingang nichts gefunden.'}
                    </p>
                  )}
                  {tab === 'offene' && (
                    <p className="pb-5 text-[13px] text-text-secondary">
                      Die Suche über alle offenen Posten folgt mit dem Ausbau dieses Bildschirms.
                    </p>
                  )}
                  {tab === 'sonstiges' && (
                    <p className="pb-5 text-[13px] text-text-secondary">
                      Vorauszahlung, Ausbuchen und Rückstellung führen über die bestehenden
                      Vorgänge — sie sind hier noch nicht verdrahtet.
                    </p>
                  )}
                </div>
              </Panel>
            </div>
          )}
        </div>
      </div>

      <RunDialog
        tenantId={tenantId}
        open={runDialog}
        onClose={() => setRunDialog(false)}
        onDone={(result) => {
          setRunResult(result)
          setAnnouncement(`${result.posted.length} gebucht, ${result.skipped.length} übersprungen`)
          void queryClient.invalidateQueries({ queryKey: worklistKey(tenantId) })
          void queryClient.invalidateQueries({ queryKey: worklistCountKey(tenantId) })
        }}
        importId={rows.at(0)?.importId}
      />

      <WithdrawDialog
        tenantId={tenantId}
        row={withdrawing}
        onClose={() => setWithdrawing(null)}
        onDone={() => {
          void queryClient.invalidateQueries({ queryKey: worklistKey(tenantId) })
          void queryClient.invalidateQueries({ queryKey: worklistCountKey(tenantId) })
        }}
      />
    </>
  )
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] text-text-tertiary">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  )
}

/**
 * The confirmation before a collective run.
 *
 * <p>Count, sum, largest single amount and the confidence line — the same shape as the
 * write-off run, and at the same time the WCAG 3.3.4 safeguard for a financial transaction.
 */
function RunDialog({
  tenantId,
  open,
  onClose,
  onDone,
  importId,
}: {
  tenantId: number
  open: boolean
  onClose: () => void
  onDone: (result: MatchRunResult) => void
  importId?: number
}) {
  const proposal = useQuery({
    queryKey: ['banking-match-run-proposal', tenantId, importId],
    queryFn: () => fetchMatchRunProposal(tenantId, importId ?? 0, 'HOCH'),
    enabled: open && importId !== undefined,
  })

  const book = useMutation({
    mutationFn: () => runMatch(tenantId, importId ?? 0, 'HOCH'),
    onSuccess: (result) => {
      onDone(result)
      onClose()
    },
  })

  return (
    <Dialog
      open={open}
      title="Alle sicheren übernehmen"
      onClose={onClose}
      onSubmit={() => book.mutate()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={() => book.mutate()}
            disabled={(proposal.data?.count ?? 0) === 0}
            busy={book.isPending}
          >
            Übernehmen
          </Button>
        </>
      }
    >
      <div className="grid gap-3 text-[13px]">
        {proposal.data === undefined ? (
          <p>Wird gerechnet …</p>
        ) : (
          <>
            <p>
              <strong>{proposal.data.count}</strong> Eingänge über{' '}
              <strong>
                {formatAmount(proposal.data.total)} {proposal.data.currencyCode}
              </strong>
              , grösster Einzelbetrag {formatAmount(proposal.data.largest)}.
            </p>
            <p className="text-text-secondary">
              Übernommen wird nur, was <strong>hoch</strong> und ohne Prüfflag ist und keinen
              Restbetrag lässt. Je Eingang entsteht eine eigene Ausgleichszeile; ein Fehler
              bleibt bei seinem Posten und hält den Lauf nicht auf.
            </p>
            <p className="text-text-tertiary">
              Eine Zuordnung lässt sich danach nur durch eine Gegenbuchung zurücknehmen.
            </p>
          </>
        )}
        {book.error !== null && <ErrorNotice error={book.error} />}
      </div>
    </Dialog>
  )
}

/**
 * Taking an assignment back — and what that means for the dunning.
 *
 * <p>Two directions, both expensive. The heavier one is a reminder that already went out: it
 * is a numbered, archived letter that can be withdrawn but never deleted. The dialog points at
 * the withdrawal; it never performs it (backend ADR-0109).
 */
function WithdrawDialog({
  tenantId,
  row,
  onClose,
  onDone,
}: {
  tenantId: number
  row: WorklistRow | null
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = useState('')

  const conflicts = useQuery({
    queryKey: ['banking-dunning-conflicts', tenantId, row?.id],
    queryFn: () => fetchDunningConflicts(tenantId, row?.id ?? 0),
    enabled: row !== null,
  })

  const take = useMutation({
    mutationFn: () => withdrawAssignment(tenantId, row?.id ?? 0, reason),
    onSuccess: () => {
      onDone()
      setReason('')
      onClose()
    },
  })

  return (
    <Dialog
      open={row !== null}
      title="Zuordnung zurücknehmen"
      onClose={onClose}
      onSubmit={() => reason.trim() !== '' && take.mutate()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={() => take.mutate()}
            disabled={reason.trim() === ''}
            busy={take.isPending}
          >
            Gegenbuchen
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <p className="text-[13px] text-text-secondary">
          Zurückgenommen wird durch eine <strong>Gegenbuchung</strong>, nie durch Löschen: im
          Journal steht eine Korrektur immer als Paar.
        </p>
        {(conflicts.data ?? []).map((conflict) => (
          <WarningNotice key={conflict.documentId}>{conflict.message}</WarningNotice>
        ))}
        <TextField
          label="Grund"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          hint="Steht auf der Gegenbuchung."
        />
        {take.error !== null && <ErrorNotice error={take.error} />}
      </div>
    </Dialog>
  )
}
