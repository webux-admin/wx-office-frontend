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
import { useDebouncedValue } from '../components/useDebouncedValue'
import { useSubmitShortcut } from '../components/useSubmitShortcut'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import {
  ACCOUNTING_MODULE,
  ACCOUNTING_RIGHTS,
  ACCOUNTING_SETUP_PATH,
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
  entryTemplatesKey,
  fetchAccounts,
  fetchEntry,
  fetchEntryTemplates,
  fetchFiscalYears,
  fetchTaxCodes,
  fiscalYearsKey,
  postEntry,
  readEntryDraft,
  taxCodesKey,
  updateEntry,
  writeEntryDraft,
  type EntryDraftRow,
  type EntryDraftState,
} from '../lib/accounting'
import { api } from '../lib/api'
import { formatDate, toIsoDate } from '../lib/format'
import { listQuery, PICKER_SIZE } from '../lib/paging'
import type { AccountingSettings, Entry, EntrySuggestion, EntryTemplate } from '../lib/types'
import { EntryTemplateMenu } from './accounting/EntryTemplateMenu'
import { EntryTextField } from './accounting/EntryTextField'
import { ManageTemplatesDialog } from './accounting/ManageTemplatesDialog'
import { SaveTemplateDialog } from './accounting/SaveTemplateDialog'
import {
  replacementWarning,
  rescueHeadline,
  rescueStateOf,
  rowsFromLines,
  rowsFromTemplate,
  stateFromRescue,
  type RescuedDraft,
} from './accounting/entryTemplateForm'

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
 * <p><b>A rescued state is never taken back on its own.</b> A mask that fills itself with two
 * account rows on opening looks like an entry that already exists, so a banner over the grid
 * offers it back and names the moment, the number of rows and the text.
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
  const mayRead = can(ACCOUNTING_RIGHTS.read)

  const today = toIsoDate()
  const [draft, setDraft] = useState<EntryDraftState>(() => emptyEntryDraft(today))
  // Read once, in the initialiser: what was rescued belongs to the moment the mask opens, and
  // reading it later would fight with what somebody has typed since. Reading it also throws
  // away what was left lying for every other tenant.
  const [offer, setOffer] = useState<RescuedDraft | undefined>(() =>
    editing === null ? stateFromRescue(readEntryDraft(tenantId)) : undefined,
  )
  const [confirming, setConfirming] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [done, setDone] = useState<Done | null>(null)
  const [applying, setApplying] = useState<EntryTemplate | null>(null)
  const [saving, setSaving] = useState(false)
  const [managing, setManaging] = useState(false)
  // The row keys whose amounts came out of a template and are still nothing but a proposal.
  const [proposed, setProposed] = useState<number[]>([])

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
  // The list carries the version of every template, which is what makes renaming, reordering
  // and «Überschreiben?» possible at all. Asked only where the right to read it is held.
  const templates = useQuery({
    queryKey: entryTemplatesKey(tenantId),
    queryFn: () => fetchEntryTemplates(tenantId),
    enabled: mayRead,
  })

  // A stored draft takes the place of the typed one, once and only once — adjusted here
  // during render rather than in an effect, which would draw the mask empty for one frame and
  // fill it in the next (the same call `Dialog` makes).
  const [loaded, setLoaded] = useState<number | null>(null)
  if (editing !== null && stored.data !== undefined && loaded !== editing) {
    setLoaded(editing)
    setDraft(draftOf(stored.data))
  }

  // Kept while something is typed, thrown away as soon as nothing is: the key exists exactly
  // as long as there is a state worth rescuing. Debounced, so a keystroke that costs no
  // request does not cost a write to the store either.
  const settled = useDebouncedValue(draft, 400)
  useEffect(() => {
    if (editing !== null) return
    // Written while the banner is standing too. What is typed under it is newer than what the
    // banner offers, and the banner keeps its own copy anyway — leaving the typing unrescued
    // would mean an F5 brings the older state back over it.
    if (!isDirty(settled)) return
    writeEntryDraft(tenantId, rescueStateOf(settled, new Date().toISOString()))
  }, [tenantId, settled, editing])

  useEffect(() => {
    if (editing !== null) return
    // The live state decides the throwing away, not only the debounced one. «Weiterschreiben»
    // fills the mask and drops the banner in the same tick, while `settled` still holds the
    // empty state of 400 ms ago — clearing on that would wipe the store, and a reload inside
    // that window would lose the draft outright.
    if (isDirty(draft) || isDirty(settled)) return
    // Nothing stands in the mask. While the banner is up, what it offers back is still in the
    // store, and it is the only copy that survives a reload.
    if (offer !== undefined) return
    clearEntryDraft(tenantId)
  }, [tenantId, draft, settled, editing, offer])

  const currencyCode = settings.data?.ledgerCurrency ?? 'CHF'
  const chart = accounts.data?.content ?? []
  const codes = (taxCodes.data?.codes ?? []).filter((code) => code.active)
  const kept = templates.data ?? []
  // What applying a template would replace — the two header fields as much as the rows.
  const replaced = replacementWarning(draft)

  function afterSave(saved: Entry, message: Done) {
    clearEntryDraft(tenantId)
    // And the banner goes with the store — here, above the early return, so the posting path
    // drops it as well. A banner left standing over a saved entry offers «Weiterschreiben» on
    // a booking that is already in the books; the state behind it counts as typed, so the
    // debounced effect writes it straight back into the store and the next reload offers it
    // again. That is the duplicate this rescue exists to prevent, not to produce.
    setOffer(undefined)
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
    setProposed([])
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

  /**
   * Puts a template into the grid — and asks first where anything it would replace is typed.
   *
   * <p><b>Applying replaces, it does not append.</b> Appending would be the more dangerous of
   * the two: the sums would stay balanced, the amount would be there twice, and the entry would
   * look right.
   *
   * <p><b>The question counts the two header fields, not only the rows.</b> Applying replaces
   * the entry text and the voucher too, so somebody who typed a reference and a booking text
   * and has not filled a row yet would otherwise lose both without ever seeing the question.
   */
  function applyTemplate(template: EntryTemplate) {
    if (replaced !== undefined) {
      setApplying(template)
      return
    }
    takeTemplate(template)
  }

  function takeTemplate(template: EntryTemplate) {
    const rows = rowsFromTemplate(template)
    setDraft({
      ...draft,
      // A template carries no booking date, so the date stays. The two other header fields are
      // replaced: a template without them leaves them empty, which is what it says it does.
      description: template.entryDescription ?? '',
      documentReference: template.documentReference ?? '',
      rows,
    })
    setProposed(template.carriesAmounts ? rows.map((row) => row.key) : [])
    setApplying(null)
  }

  /**
   * A text chosen from the list brings the accounts of the entry it comes from.
   *
   * <p>Only where the grid carries no account yet: a proposal over rows somebody has filled
   * would overwrite their work. And only where the text was **chosen** — typing the same text
   * by hand proposes nothing, because a proposal on a merely similar text would be a guess.
   */
  function takeSuggestion(suggestion: EntrySuggestion) {
    if (draft.rows.some((row) => row.accountId !== null)) return
    const rows = rowsFromLines(suggestion.lines)
    setDraft({ ...draft, description: suggestion.text, rows })
    setProposed(rows.map((row) => row.key))
  }

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
              description="Gebucht wird auf Konten. Der Assistent führt in drei Schritten durch Kontenplan, Geschäftsjahr und Eröffnung."
            >
              <span className="flex flex-wrap justify-center gap-2">
                {/* First, and deliberately: whoever lands here has nothing at all yet, and the
                    three steps are the shorter way than three screens found one by one. */}
                <Link to={ACCOUNTING_SETUP_PATH}>
                  <Button>Buchhaltung einrichten</Button>
                </Link>
                <Link to={CHART_OF_ACCOUNTS_PATH}>
                  <Button variant="secondary">Kontenplan anlegen</Button>
                </Link>
              </span>
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
              <span className="flex flex-wrap justify-center gap-2">
                <Link to={ACCOUNTING_SETUP_PATH}>
                  <Button>Buchhaltung einrichten</Button>
                </Link>
                <Link to={FISCAL_YEARS_PATH}>
                  <Button variant="secondary">Geschäftsjahr anlegen</Button>
                </Link>
              </span>
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
        <EntryTemplateMenu
          templates={kept}
          onApply={applyTemplate}
          onSave={() => setSaving(true)}
          onManage={() => setManaging(true)}
          disabled={busy}
        />
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
        {offer !== undefined && (
          <Panel>
            <div className="grid gap-2 text-[13px]">
              <p>{rescueHeadline(offer.savedAt)}</p>
              <p className="text-text-secondary">
                {offer.rowCount === 1 ? '1 Zeile' : `${offer.rowCount} Zeilen`}
                {offer.description.trim() === '' ? '' : `, Text «${offer.description}»`}.
              </p>
              <span className="flex gap-2">
                <Button
                  onClick={() => {
                    setDraft(offer.state)
                    setOffer(undefined)
                  }}
                >
                  Weiterschreiben
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    clearEntryDraft(tenantId)
                    setOffer(undefined)
                  }}
                >
                  Verwerfen
                </Button>
              </span>
            </div>
          </Panel>
        )}

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
            <EntryTextField
              tenantId={tenantId}
              value={draft.description}
              onChange={(next) => setDraft({ ...draft, description: next })}
              onPick={takeSuggestion}
              disabled={busy}
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
            suggestedAmounts={proposed}
            onAmountTyped={(key) => setProposed((keys) => keys.filter((entry) => entry !== key))}
          />
        </Panel>
      </div>

      <Dialog
        open={applying !== null}
        title="Vorlage anwenden"
        onClose={() => setApplying(null)}
        onSubmit={() => applying !== null && takeTemplate(applying)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setApplying(null)}>
              Abbrechen
            </Button>
            <Button onClick={() => applying !== null && takeTemplate(applying)}>Ersetzen</Button>
          </>
        }
      >
        <p className="text-[13px]">{replaced}</p>
      </Dialog>

      {saving && (
        <SaveTemplateDialog
          tenantId={tenantId}
          rows={draft.rows}
          entryDescription={draft.description}
          documentReference={draft.documentReference}
          accounts={chart}
          taxCodes={codes}
          templates={kept}
          onClose={() => setSaving(false)}
        />
      )}

      {managing && (
        <ManageTemplatesDialog
          tenantId={tenantId}
          templates={kept}
          onClose={() => setManaging(false)}
        />
      )}

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
  return draft.rows.some((row) => carriesSomething(row) || row.taxCodeId !== null)
}

/** Whether one row holds anything at all. */
function carriesSomething(row: EntryDraftRow): boolean {
  return (
    row.accountId !== null
    || row.accountText.trim() !== ''
    || row.debit.trim() !== ''
    || row.credit.trim() !== ''
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
