import { useEffect, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import { EntryGrid } from '../components/EntryGrid'
import { EmptyState, ErrorNotice, LoadingBlock } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { TextField } from '../components/TextField'
import { useSubmitShortcut } from '../components/useSubmitShortcut'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import {
  ACCOUNTING_MODULE,
  ACCOUNTING_RIGHTS,
  CHART_OF_ACCOUNTS_PATH,
  DRAFT_PATH,
  FISCAL_YEARS_PATH,
  JOURNAL_PATH,
  accountingSettingsKey,
  accountingSettingsUrl,
  accountsKey,
  attentionKey,
  clearEntryDraft,
  createEntry,
  deleteEntry,
  emptyEntryDraft,
  entryKey,
  entryRequestOf,
  fetchAccounts,
  fetchEntry,
  fetchFiscalYears,
  fetchTaxCodes,
  fiscalYearsKey,
  postEntry,
  readEntryDraft,
  taxCodesKey,
  updateEntry,
  writeEntryDraft,
  type EntryDraftState,
} from '../lib/accounting'
import { api } from '../lib/api'
import { formatDate, toIsoDate } from '../lib/format'
import { listQuery, PICKER_SIZE } from '../lib/paging'
import type { AccountingSettings, Entry } from '../lib/types'

/** What has to be shown after a save, and where it leads. */
type Done = { message: string; to: string; label: string }

/**
 * «Buchen»: the first screen of this application that writes into the books.
 *
 * <p><b>The mask keys itself on the tenant.</b> What is typed is rescued locally under
 * `webux.accounting.draft.<tenantId>` so a page change does not lose it — and switching tenant
 * has to empty the mask, because otherwise the half typed entry of another business turns up in
 * it, account numbers and amounts included (ADR-0045).
 *
 * <p><b>Its empty states name the missing precondition</b>, in the order the three bolts are
 * checked: without a chart of accounts nothing can be typed at all, and without a fiscal year
 * covering the booking date nothing can be stored. Until the setup assistant exists, that chain
 * is not something a non-bookkeeper can work out.
 */
export function EntryPage() {
  return (
    <RequireTenant permission={ACCOUNTING_RIGHTS.write} module={ACCOUNTING_MODULE}>
      {(tenantId) => <EntryMask key={tenantId} tenantId={tenantId} />}
    </RequireTenant>
  )
}

function EntryMask({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const params = useParams<{ id?: string }>()
  const editing = params.id === undefined ? null : Number(params.id)
  const mayPost = can(ACCOUNTING_RIGHTS.post)

  const today = toIsoDate()
  // Read once, in the initialiser: a rescued draft belongs to the moment the mask opens, and
  // reading it later would fight with what somebody has typed since.
  const [draft, setDraft] = useState<EntryDraftState>(
    () => (editing === null ? readEntryDraft(tenantId) : null) ?? emptyEntryDraft(today),
  )
  const [confirming, setConfirming] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [done, setDone] = useState<Done | null>(null)

  const accounts = useQuery({
    queryKey: accountsKey(tenantId, ACCOUNT_QUERY),
    queryFn: () => fetchAccounts(tenantId, ACCOUNT_QUERY),
  })
  const taxCodes = useQuery({
    queryKey: taxCodesKey(tenantId),
    queryFn: () => fetchTaxCodes(tenantId),
  })
  const years = useQuery({
    queryKey: fiscalYearsKey(tenantId),
    queryFn: () => fetchFiscalYears(tenantId),
  })
  const settings = useQuery({
    queryKey: accountingSettingsKey(tenantId),
    queryFn: () => api.get<AccountingSettings>(accountingSettingsUrl(tenantId)),
  })
  const stored = useQuery({
    queryKey: entryKey(tenantId, editing ?? 0),
    queryFn: () => fetchEntry(tenantId, editing ?? 0),
    enabled: editing !== null,
  })

  // A stored draft takes the place of the rescued one, once and only once — adjusted here
  // during render rather than in an effect, which would draw the mask empty for one frame and
  // fill it in the next (the same call `Dialog` makes).
  const [loaded, setLoaded] = useState<number | null>(null)
  if (editing !== null && stored.data !== undefined && loaded !== editing) {
    setLoaded(editing)
    setDraft(draftOf(stored.data))
  }

  // Kept while something is typed, thrown away as soon as nothing is: the key exists exactly
  // as long as there is a state worth rescuing.
  useEffect(() => {
    if (editing !== null) return
    if (isDirty(draft)) writeEntryDraft(tenantId, draft)
    else clearEntryDraft(tenantId)
  }, [tenantId, draft, editing])

  const currencyCode = settings.data?.ledgerCurrency ?? 'CHF'
  const chart = accounts.data?.content ?? []
  const codes = (taxCodes.data?.codes ?? []).filter((code) => code.active)

  function afterSave(saved: Entry, message: Done) {
    clearEntryDraft(tenantId)
    // The prefix without the query string, so every page of the two lists is dropped and not
    // only the one nobody happens to be looking at.
    void queryClient.invalidateQueries({ queryKey: ['accounting-entries', tenantId] })
    void queryClient.invalidateQueries({ queryKey: ['accounting-journal', tenantId] })
    void queryClient.invalidateQueries({ queryKey: attentionKey(tenantId) })
    void queryClient.invalidateQueries({ queryKey: entryKey(tenantId, saved.id ?? 0) })
    if (editing !== null) {
      void navigate(DRAFT_PATH)
      return
    }
    setDraft(emptyEntryDraft(today))
    setDone(message)
  }

  const save = useMutation({
    mutationFn: () =>
      editing === null
        ? createEntry(tenantId, entryRequestOf(draft))
        : updateEntry(tenantId, editing, entryRequestOf(draft)),
    onSuccess: (saved) =>
      afterSave(saved, {
        message: 'Die Buchung ist als Entwurf gespeichert und noch nicht verbucht.',
        to: DRAFT_PATH,
        label: 'Zu den Entwürfen',
      }),
  })

  const saveAndPost = useMutation({
    mutationFn: async () => {
      const saved =
        editing === null
          ? await createEntry(tenantId, entryRequestOf(draft))
          : await updateEntry(tenantId, editing, entryRequestOf(draft))
      return postEntry(tenantId, saved.id ?? 0)
    },
    onSuccess: (posted) => {
      setConfirming(false)
      afterSave(posted, {
        message: `Verbucht als ${posted.entryNumber ?? ''}. Ändern lässt sich daran nichts mehr.`,
        to: JOURNAL_PATH,
        label: 'Im Journal ansehen',
      })
    },
  })

  const remove = useMutation({
    mutationFn: () => deleteEntry(tenantId, editing ?? 0),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounting-entries', tenantId] })
      void queryClient.invalidateQueries({ queryKey: attentionKey(tenantId) })
      setRemoving(false)
      void navigate(DRAFT_PATH)
    },
  })

  const busy = save.isPending || saveAndPost.isPending
  const failure = save.error ?? saveAndPost.error ?? remove.error

  /** What Ctrl+S does anywhere on the mask; inside the grid the grid takes the press itself. */
  const submit = () => (mayPost ? setConfirming(true) : save.mutate())
  useSubmitShortcut(busy ? undefined : submit)

  if (accounts.isLoading || years.isLoading || (editing !== null && stored.isLoading)) {
    return (
      <>
        <Header editing={editing !== null} />
        <div className="px-8 pb-12">
          <LoadingBlock />
        </div>
      </>
    )
  }
  if (accounts.error || years.error || stored.error) {
    return (
      <>
        <Header editing={editing !== null} />
        <div className="px-8 pb-12">
          <ErrorNotice error={accounts.error ?? years.error ?? stored.error} />
        </div>
      </>
    )
  }

  // The three bolts, in the order they are checked. The chart comes first: without an account
  // there is nothing to type into the first column.
  if (chart.length === 0) {
    return (
      <>
        <Header editing={editing !== null} />
        <div className="px-8 pb-12">
          <Panel padded={false}>
            <EmptyState
              title="Es gibt noch keinen Kontenplan."
              description="Gebucht wird auf Konten. Der Kontenplan wird einmal aus einer Vorlage angelegt."
            >
              <Link to={CHART_OF_ACCOUNTS_PATH}>
                <Button>Kontenplan anlegen</Button>
              </Link>
            </EmptyState>
          </Panel>
        </div>
      </>
    )
  }

  const year = (years.data?.years ?? []).find(
    (candidate) => candidate.startDate <= draft.bookingDate && draft.bookingDate <= candidate.endDate,
  )
  if (year === undefined) {
    return (
      <>
        <Header editing={editing !== null} />
        <div className="px-8 pb-12">
          <Panel padded={false}>
            <EmptyState
              title={`Für den ${formatDate(draft.bookingDate)} gibt es kein Geschäftsjahr.`}
              description="Jede Buchung gehört in ein Geschäftsjahr. Ohne eines lässt sich nichts speichern."
            >
              <Link to={FISCAL_YEARS_PATH}>
                <Button>Geschäftsjahr anlegen</Button>
              </Link>
            </EmptyState>
          </Panel>
        </div>
      </>
    )
  }

  return (
    <>
      <Header editing={editing !== null}>
        {editing !== null && (
          <Button variant="ghost" onClick={() => setRemoving(true)}>
            Entwurf löschen
          </Button>
        )}
        <Button variant="secondary" onClick={() => save.mutate()} busy={save.isPending}>
          Nur speichern
        </Button>
        {mayPost && (
          <Button onClick={() => setConfirming(true)} disabled={busy} shortcut>
            Speichern und verbuchen
          </Button>
        )}
      </Header>

      <div className="grid gap-4 px-8 pb-12">
        {done !== null && (
          <Panel>
            <p className="text-[13px]">
              {done.message}{' '}
              <Link to={done.to} className="text-accent-text underline-offset-2 hover:underline">
                {done.label}
              </Link>
            </p>
          </Panel>
        )}

        {failure !== null && <ErrorNotice error={failure} />}

        <Panel>
          <div className="grid gap-4 sm:grid-cols-[160px_200px_1fr]">
            <TextField
              label="Datum"
              type="date"
              value={draft.bookingDate}
              onChange={(event) => setDraft({ ...draft, bookingDate: event.target.value })}
              // «.» is the shortcut a bookkeeper expects for «heute» — it is the key next to
              // the number block, and nothing else in a date field means anything (ADR-0045).
              onKeyDown={(event) => {
                if (event.key !== '.') return
                event.preventDefault()
                setDraft({ ...draft, bookingDate: today })
              }}
              hint="«.» setzt das heutige Datum."
            />
            <TextField
              label="Beleg"
              value={draft.documentReference}
              maxLength={40}
              onChange={(event) =>
                setDraft({ ...draft, documentReference: event.target.value })
              }
            />
            <TextField
              label="Text"
              value={draft.description}
              maxLength={200}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </div>
        </Panel>

        <Panel>
          <EntryGrid
            rows={draft.rows}
            onRowsChange={(rows) => setDraft({ ...draft, rows })}
            accounts={chart}
            taxCodes={codes}
            currencyCode={currencyCode}
            disabled={busy}
            onSubmit={submit}
          />
        </Panel>
      </div>

      <Dialog
        open={confirming}
        title="Verbuchen"
        onClose={() => setConfirming(false)}
        onSubmit={() => saveAndPost.mutate()}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Abbrechen
            </Button>
            <Button onClick={() => saveAndPost.mutate()} busy={saveAndPost.isPending}>
              Verbuchen
            </Button>
          </>
        }
      >
        <div className="grid gap-3 text-[13px]">
          <p>{IRREVERSIBLE}</p>
          {saveAndPost.error !== null && <ErrorNotice error={saveAndPost.error} />}
        </div>
      </Dialog>

      <Dialog
        open={removing}
        title="Entwurf löschen"
        onClose={() => setRemoving(false)}
        onSubmit={() => remove.mutate()}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(false)}>
              Abbrechen
            </Button>
            <Button variant="danger" onClick={() => remove.mutate()} busy={remove.isPending}>
              Löschen
            </Button>
          </>
        }
      >
        <div className="grid gap-3 text-[13px]">
          <p>
            Ein Entwurf ist noch nicht in den Büchern. Gelöscht hinterlässt er nichts — keine
            Journalnummer, keine Lücke.
          </p>
          {remove.error !== null && <ErrorNotice error={remove.error} />}
        </div>
      </Dialog>
    </>
  )
}

/**
 * The sentence that carries the decision, word for word in both places it appears — here on the
 * single entry and in the collective step of the draft list (ADR-0045).
 */
export const IRREVERSIBLE =
  'Verbuchte Buchungen lassen sich nicht mehr ändern oder löschen. Ein Fehler wird ab dann mit '
  + 'einer Gegenbuchung aufgehoben — die alte Buchung bleibt sichtbar stehen. Das ist so '
  + 'gewollt: das Journal ist der Nachweis, dass nachträglich nichts verändert wurde.'

/** The chart is read whole: a picker wants every account, not a page. */
const ACCOUNT_QUERY = listQuery({ activeOnly: true, size: PICKER_SIZE, sort: 'accountNumber,asc' })

function Header({ editing, children }: { editing: boolean; children?: ReactNode }) {
  return (
    <PageHeader
      title={editing ? 'Entwurf bearbeiten' : 'Buchen'}
      subtitle="Soll und Haben müssen aufgehen. Was verbucht ist, bleibt stehen."
      back={editing ? { to: DRAFT_PATH, label: 'Entwürfe' } : undefined}
    >
      {children}
    </PageHeader>
  )
}

/** Whether anything worth rescuing stands in the mask. */
function isDirty(draft: EntryDraftState): boolean {
  if (draft.description.trim() !== '' || draft.documentReference.trim() !== '') return true
  return draft.rows.some(
    (row) =>
      row.accountId !== null
      || row.accountText.trim() !== ''
      || row.debit.trim() !== ''
      || row.credit.trim() !== ''
      || row.taxCodeId !== null,
  )
}

/**
 * Turns a stored draft back into what the mask types in.
 *
 * <p>The generated tax line is left out: it is written by posting and is no input row. A draft
 * cannot carry one anyway, and leaving it in would let somebody edit an amount the application
 * works out itself.
 */
function draftOf(entry: Entry): EntryDraftState {
  return {
    bookingDate: entry.bookingDate,
    documentReference: entry.documentReference,
    description: entry.description,
    rows: entry.lines
      .filter((line) => !line.taxGenerated)
      .map((line, index) => ({
        key: index + 1,
        accountId: line.accountId,
        accountText: `${line.accountNumber ?? ''} ${line.accountName ?? ''}`.trim(),
        debit: line.debit ? String(line.debit) : '',
        credit: line.credit ? String(line.credit) : '',
        taxCodeId: line.taxCodeId ?? null,
      })),
  }
}
