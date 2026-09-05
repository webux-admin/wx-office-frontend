import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { DataTable, type Column } from '../components/DataTable'
import { Dialog } from '../components/Dialog'
import { EmptyState, ErrorNotice, WarningNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { FiscalYearFields } from './accounting/FiscalYearFields'
import { useFiscalYearForm } from './accounting/fiscalYearForm'
import {
  ACCOUNTING_MODULE,
  ACCOUNTING_RIGHTS,
  ACCOUNTING_SETUP_PATH,
  ACCOUNTING_SETTINGS_PATH,
  BOUNDARY_SOURCES,
  FISCAL_YEAR_STATUS,
  createFiscalYear,
  deleteFiscalYear,
  fetchFiscalYears,
  fetchSetupState,
  fiscalYearsKey,
  setupStateKey,
  setFiscalYearStatus,
  updateFiscalYear,
} from '../lib/accounting'
import { api } from '../lib/api'
import { formatDate } from '../lib/format'
import type { FiscalYear, FiscalYearList, FiscalYearRequest, Tenant } from '../lib/types'

/**
 * The fiscal years of one tenant: what is open, from which day on anything may be posted, and
 * how much time is left on the last one.
 *
 * <p><b>One boundary and not three.</b> The three bolts — a year that is no longer open, the
 * lock date of the bookkeeping and the settled VAT period — are three dates, and a screen
 * showing all three would ask a bookkeeper to do the arithmetic. The footer shows the latest of
 * them with the name of what holds it, exactly as the backend worked it out (backend ADR-0113).
 *
 * <p><b>The two lock dates stand there as read values with a signpost and no input field.</b>
 * Each is maintained on the one screen it belongs to — the lock date under
 * *Buchhaltung → Einstellungen*, the VAT date under *Mandant → Mehrwertsteuer*. Two masks
 * writing the same field would be two caches of the same row, and one of them would be stale.
 *
 * <p><b>Both values come out of the fiscal year answer itself</b>, which is why this screen asks
 * for nothing but `ACCOUNTING_READ`. Reading the VAT date off `GET /api/tenants/{id}` needed
 * `TENANT_READ`, and a bookkeeper without that right read «nicht gesetzt» at a date that was
 * set — a wrong display, not a missing one (backend ADR-0113).
 */
export function FiscalYearPage() {
  return (
    <RequireTenant permission={ACCOUNTING_RIGHTS.read} module={ACCOUNTING_MODULE}>
      {(tenantId) => <FiscalYears tenantId={tenantId} />}
    </RequireTenant>
  )
}

/** What the dialog is doing: laying out a new year or correcting one that carries no posting. */
type DialogState = { mode: 'create' } | { mode: 'edit'; year: FiscalYear }

function FiscalYears({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const mayClose = can(ACCOUNTING_RIGHTS.close)
  const mayReadTenant = can('TENANT_READ')

  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [removing, setRemoving] = useState<FiscalYear | null>(null)

  const list = useQuery({
    queryKey: fiscalYearsKey(tenantId),
    queryFn: () => fetchFiscalYears(tenantId),
  })
  // One call, and only for the notice above the table: it says whether the year today falls into
  // carries an opening entry. The answer of `GET /fiscal-years` stays untouched by it.
  const setup = useQuery({
    queryKey: setupStateKey(tenantId),
    queryFn: () => fetchSetupState(tenantId),
  })

  // Read for one thing only: the month the create dialog opens the very first year on. Both
  // lock dates travel in the fiscal year answer, so nothing the screen *shows* hangs on this
  // request. Whoever holds no TENANT_READ gets January as the prefill and corrects the two
  // dates in the dialog — a prefill nobody can see is wrong is a smaller price than a right
  // this screen has no business demanding.
  const tenant = useQuery({
    queryKey: ['tenant', `${tenantId}`],
    queryFn: () => api.get<Tenant>(`/api/tenants/${tenantId}`),
    enabled: mayReadTenant,
  })

  const status = useMutation({
    mutationFn: (year: FiscalYear) =>
      setFiscalYearStatus(tenantId, year.id, year.status === 'OPEN' ? 'LOCKED' : 'OPEN'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: fiscalYearsKey(tenantId) })
    },
  })

  const remove = useMutation({
    mutationFn: (year: FiscalYear) => deleteFiscalYear(tenantId, year.id),
    onSuccess: () => {
      setRemoving(null)
      void queryClient.invalidateQueries({ queryKey: fiscalYearsKey(tenantId) })
    },
  })

  const years = list.data?.years ?? []
  const expiry = list.data?.expiry
  const boundary = list.data?.boundary

  const openCreate = () => {
    remove.reset()
    setDialog({ mode: 'create' })
  }

  /**
   * What a row offers: the state switch as a button, everything rarer behind the menu.
   *
   * <p>«Löschen» is in the menu and never a button of its own, and it is missing altogether at
   * a year that carries a drawn journal number — the backend refuses that with 409, and a
   * button whose only outcome is a refusal is a trap.
   *
   * <p>A function returning nodes and not a component of its own: a component declared inside
   * this one gets a new identity on every render, and the menu would shut itself the moment
   * anything else on the screen changed.
   */
  const rowActions = (year: FiscalYear) => {
    const entries = [
      year.editable
        ? { id: 'edit', label: 'Ändern', onSelect: () => setDialog({ mode: 'edit', year }) }
        : null,
      year.deletable
        ? {
            id: 'delete',
            label: 'Löschen',
            onSelect: () => {
              remove.reset()
              setRemoving(year)
            },
          }
        : null,
    ].filter((entry) => entry !== null)

    return (
      <span className="flex items-center justify-end gap-2">
        {year.status !== 'CLOSED' && (
          <Button
            variant="secondary"
            onClick={() => status.mutate(year)}
            busy={status.isPending && status.variables?.id === year.id}
          >
            {year.status === 'OPEN' ? 'Sperren' : 'Öffnen'}
          </Button>
        )}
        {entries.length > 0 && (
          <RowMenu label={`Weitere Aktionen für ${year.label}`} entries={entries} />
        )}
      </span>
    )
  }

  const columns: Column<FiscalYear>[] = [
    {
      key: 'label',
      header: 'Bezeichnung',
      width: 'w-[180px]',
      render: (year) => <span className="font-medium">{year.label}</span>,
    },
    {
      key: 'start',
      header: 'Beginn',
      width: 'w-[130px]',
      render: (year) => (
        <span className="font-mono tabular-nums">{formatDate(year.startDate)}</span>
      ),
    },
    {
      key: 'end',
      header: 'Ende',
      width: 'w-[130px]',
      render: (year) => (
        <span className="font-mono tabular-nums">{formatDate(year.endDate)}</span>
      ),
    },
    {
      key: 'series',
      header: 'Serie',
      align: 'right',
      width: 'w-[100px]',
      hideBelow: 'sm',
      render: (year) => <span className="font-mono tabular-nums">{year.numberYear}</span>,
    },
    {
      key: 'status',
      header: 'Zustand',
      width: 'w-[140px]',
      render: (year) => (
        <Badge tone={year.status === 'OPEN' ? 'success' : 'muted'}>
          {FISCAL_YEAR_STATUS[year.status]}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (year) => (mayClose ? rowActions(year) : null),
    },
  ]

  return (
    <>
      <PageHeader
        title="Geschäftsjahre"
        subtitle="Ohne offenes Geschäftsjahr lässt sich nichts buchen."
      >
        {mayClose && (
          <Button onClick={openCreate}>
            <Plus size={15} aria-hidden />
            Geschäftsjahr anlegen
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-4 px-8 pb-12">
        {/* The fourth way into the setup wizard, and the one that keeps step 3 reachable at all.
            Whoever laid the chart and the year out by hand — the ordinary case once these two
            screens exist — has no empty state left anywhere and would never get at the opening
            entry. It stands for the year today falls into and for no other, or it would stand ten
            times under each other after ten years.

            `nextStep` and not a rule of its own: the backend already knows whether the opening
            is what is left — including that «ich fange bei null an» finishes the wizard too. A
            second rule here would disagree with it the day one of them changes. */}
        {setup.data?.nextStep === 'OPENING' && setup.data.fiscalYear && (
            <WarningNotice>
              <span className="flex flex-wrap items-baseline gap-2">
                <span>
                  Für {setup.data.fiscalYear.label} besteht keine Eröffnungsbuchung. Wenn Sie mit
                  Saldi aus einer bestehenden Buchhaltung starten, tragen Sie sie hier ein.
                </span>
                <button
                  type="button"
                  onClick={() => void navigate(ACCOUNTING_SETUP_PATH)}
                  className="text-accent-text underline-offset-2 hover:underline"
                >
                  Eröffnung erfassen
                </button>
              </span>
            </WarningNotice>
          )}

        {expiry?.warn === true && (
          <WarningNotice>
            <ExpirySentence expiry={expiry} />{' '}
            {mayClose && (
              <button
                type="button"
                onClick={openCreate}
                className="text-accent-text underline-offset-2 hover:underline"
              >
                Folgejahr anlegen
              </button>
            )}
          </WarningNotice>
        )}

        {status.error !== null && <ErrorNotice error={status.error} />}

        <Panel padded={false}>
          <DataTable
            columns={columns}
            rows={years}
            keyOf={(year) => year.id}
            loading={list.isPending}
            error={list.error}
            empty={
              <EmptyState
                title="Es gibt noch kein Geschäftsjahr"
                description="Ohne eines lässt sich nichts buchen. Beginn und Ende bestimmen, welche Belege in welche Periode fallen."
              >
                <span className="flex flex-wrap justify-center gap-2">
                  {/* First, and deliberately: whoever is setting up wants the three steps, and
                      whoever knows what they are doing takes the second button. */}
                  <Button onClick={() => void navigate(ACCOUNTING_SETUP_PATH)}>
                    Buchhaltung einrichten
                  </Button>
                  {mayClose && (
                    <Button variant="secondary" onClick={openCreate}>
                      <Plus size={15} aria-hidden />
                      Nur Geschäftsjahr anlegen
                    </Button>
                  )}
                </span>
              </EmptyState>
            }
          />
        </Panel>

        {boundary !== undefined && (
          <Panel title="Buchungsgrenze">
            <div className="grid gap-4 text-[13px]">
              <div>
                <p className="font-medium">
                  {boundary.postableFrom
                    ? `Gebucht wird ab dem ${formatDate(boundary.postableFrom)}.`
                    : 'Es ist nichts gesperrt.'}
                </p>
                {boundary.message !== '' && (
                  <p className="mt-1 text-text-secondary">
                    {boundary.message} Quelle: {BOUNDARY_SOURCES[boundary.source]}.
                  </p>
                )}
              </div>

              <dl className="grid gap-3">
                <ReadOnlyDate
                  term="Sperrdatum"
                  value={list.data?.postingsLockedUntil}
                  to={ACCOUNTING_SETTINGS_PATH}
                  linkLabel="Buchhaltung → Einstellungen"
                />
                <ReadOnlyDate
                  term="MWST abgerechnet bis"
                  value={list.data?.vatPeriodsLockedUntil}
                  to={mayReadTenant ? `/mandanten/${tenantId}` : undefined}
                  linkLabel="Mandant → Mehrwertsteuer"
                />
              </dl>
            </div>
          </Panel>
        )}
      </div>

      <FiscalYearDialog
        tenantId={tenantId}
        state={dialog}
        years={years}
        fiscalYearStartMonth={tenant.data?.fiscalYearStartMonth ?? 1}
        onClose={() => setDialog(null)}
      />

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Geschäftsjahr löschen"
        onSubmit={removing === null ? undefined : () => remove.mutate(removing)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Abbrechen
            </Button>
            <Button
              variant="danger"
              onClick={() => removing && remove.mutate(removing)}
              busy={remove.isPending}
              shortcut
            >
              Löschen
            </Button>
          </>
        }
      >
        <div className="grid gap-3 text-[13px]">
          <p>
            Das Geschäftsjahr {removing?.label} und sein Protokoll werden gelöscht. Es ist keine
            Journalnummer vergeben worden.
          </p>
          {remove.error !== null && <ErrorNotice error={remove.error} />}
        </div>
      </Dialog>
    </>
  )
}

/**
 * The sentence over the warning, in the tense the date calls for.
 *
 * <p>Both cases come from the same `warn`, which the backend sets at thirty days and keeps set
 * once the day has passed. The thirty are counted there and nowhere here.
 */
function ExpirySentence({ expiry }: { expiry: { lastEndDate?: string | null; daysLeft?: number | null } }) {
  const last = formatDate(expiry.lastEndDate)
  if ((expiry.daysLeft ?? 0) < 0) {
    return (
      <>
        <strong>Das letzte Geschäftsjahr endete am {last}.</strong> Seither lässt sich nichts
        mehr buchen, bis das Folgejahr angelegt ist.
      </>
    )
  }
  return (
    <>
      <strong>Das letzte Geschäftsjahr endet am {last}.</strong> Danach lässt sich nichts mehr
      buchen, bis das Folgejahr angelegt ist.
    </>
  )
}

/** One of the two lock dates: the day, and the way to the mask that owns it. */
function ReadOnlyDate({
  term,
  value,
  to,
  linkLabel,
}: {
  term: string
  value: string | null | undefined
  /** Absent where the reader holds no right for the mask behind it. */
  to?: string
  linkLabel: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <dt className="w-[190px] shrink-0 text-text-secondary">{term}</dt>
      <dd className="flex flex-wrap items-center gap-3">
        <span className="font-mono tabular-nums">{value ? formatDate(value) : 'nicht gesetzt'}</span>
        {to !== undefined && (
          <Link to={to} className="text-accent-text underline-offset-2 hover:underline">
            {linkLabel}
          </Link>
        )}
      </dd>
    </div>
  )
}

/** One entry of a {@link RowMenu}. */
type RowMenuEntry = { id: string; label: string; onSelect: () => void }

/**
 * The rarer actions of a row, behind one button.
 *
 * <p>Kept here rather than in `components/` while it has a single caller: a shared control is
 * extracted at the third use, not at the first (CLAUDE.md section 3).
 *
 * <p>It is operated the way a menu is expected to be, and the same way `components/SplitButton`
 * does it: the arrow keys walk the entries and wrap round, Home and End jump to the ends,
 * Escape closes and hands focus back to the button, and a click elsewhere closes it too. Focus
 * follows the highlighted entry, so a screen reader reads out what the arrow keys move over.
 * That is not decoration — a control announcing `role="menu"` and then ignoring the arrow keys
 * is worse than one with no role at all, because the promise is what the reader goes by.
 */
function RowMenu({ label, entries }: { label: string; entries: RowMenuEntry[] }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const box = useRef<HTMLSpanElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const items = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  // Focus follows the highlighted entry rather than staying on the button that opened the
  // menu, so what a screen reader announces is what the arrow keys have moved to.
  useEffect(() => {
    if (open) items.current[active]?.focus()
  }, [open, active])

  const close = (returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) toggle.current?.focus()
  }

  const openAt = (index: number) => {
    setActive(index)
    setOpen(true)
  }

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((current) => (current + 1) % entries.length)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((current) => (current - 1 + entries.length) % entries.length)
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      setActive(0)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      setActive(entries.length - 1)
    }
  }

  // Picking hands focus to whatever the entry opens — a dialog, mostly — and not back to the
  // button, which would take the focus away from the box that just appeared.
  const pick = (entry: RowMenuEntry) => {
    close(false)
    entry.onSelect()
  }

  return (
    <span ref={box} className="relative inline-flex">
      <button
        ref={toggle}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close(false) : openAt(0))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            openAt(0)
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            openAt(entries.length - 1)
          }
        }}
        className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] border border-line text-text-secondary transition-colors hover:bg-sunken hover:text-text-primary"
      >
        <MoreHorizontal size={15} aria-hidden />
      </button>
      {open && (
        <span
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-full z-20 mt-1 grid min-w-[160px] rounded-[var(--radius-md)] border border-line bg-surface py-1 shadow-card"
        >
          {entries.map((entry, index) => (
            <button
              key={entry.id}
              ref={(element) => {
                items.current[index] = element
              }}
              type="button"
              role="menuitem"
              onClick={() => pick(entry)}
              onMouseEnter={() => setActive(index)}
              className={`px-4 py-2 text-left text-[13px] transition-colors hover:bg-sunken ${
                index === active ? 'bg-sunken' : ''
              }`}
            >
              {entry.label}
            </button>
          ))}
        </span>
      )}
    </span>
  )
}

/**
 * Lays out a fiscal year, or corrects one that carries no posting.
 *
 * <p>While creating, every change to beginning, end, name or series asks the backend what would
 * come of it — debounced, because a request per keystroke would arrive in an order nobody
 * controls. The answer fills name and series as long as nobody has typed into them, and it
 * carries the two sentences: `error` switches the button off, `warning` renames it «Trotzdem
 * anlegen». The warning is confirmed through the wording of the button and not through a second
 * dialog.
 *
 * <p><b>Name and series travel where somebody has typed them</b>, and the answer is then about
 * those. Asking on the dates alone left the second period of a split year unbuildable: the
 * calculator said the series was taken, the reader typed a free one exactly as told, no request
 * went out under the unchanged key, and the sentence never cleared.
 *
 * <p>While correcting, <b>no preview is asked for</b>: it would compare the range against the
 * very year being edited and report an overlap with itself.
 */
function FiscalYearDialog({
  tenantId,
  state,
  years,
  fiscalYearStartMonth,
  onClose,
}: {
  tenantId: number
  state: DialogState | null
  years: FiscalYear[]
  fiscalYearStartMonth: number
  onClose: () => void
}) {
  // Nothing at all while it is shut: the form state of the box belongs to the year it is
  // about, and a box that kept it would open the next time with the last year still in it.
  if (state === null) return null
  const key = state.mode === 'edit' ? `edit-${state.year.id}` : 'create'
  return (
    <YearDialogBody
      key={key}
      tenantId={tenantId}
      state={state}
      years={years}
      fiscalYearStartMonth={fiscalYearStartMonth}
      onClose={onClose}
    />
  )
}

function YearDialogBody({
  tenantId,
  state,
  years,
  fiscalYearStartMonth,
  onClose,
}: {
  tenantId: number
  state: DialogState
  years: FiscalYear[]
  fiscalYearStartMonth: number
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const creating = state.mode === 'create'
  // The four fields and their pre-fill live in one place, because step 2 of the setup wizard
  // shows the very same form. A second pre-fill calculation beside this one would run alike for
  // two years and fall apart on the first short fiscal year.
  const form = useFiscalYearForm(
    tenantId,
    years,
    fiscalYearStartMonth,
    state.mode === 'edit' ? state.year : undefined,
  )

  const save = useMutation({
    mutationFn: (request: FiscalYearRequest) =>
      state.mode === 'edit'
        ? updateFiscalYear(tenantId, state.year.id, request).then(() => undefined)
        : createFiscalYear(tenantId, request).then((list: FiscalYearList) => {
            queryClient.setQueryData(fiscalYearsKey(tenantId), list)
          }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: fiscalYearsKey(tenantId) })
      onClose()
    },
  })

  const blocked = form.request === undefined || save.isPending

  const submit = () => {
    if (form.request === undefined || save.isPending) return
    save.mutate(form.request)
  }

  const action = creating ? (form.warning === '' ? 'Anlegen' : 'Trotzdem anlegen') : 'Speichern'

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={creating ? 'Geschäftsjahr anlegen' : 'Geschäftsjahr ändern'}
      description="Beginn und Ende bestimmen, in welche Periode ein Beleg fällt."
      onSubmit={blocked ? undefined : submit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={submit} busy={save.isPending} disabled={blocked} shortcut>
            {action}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <FiscalYearFields state={form} creating={creating} />
        {save.error !== null && <ErrorNotice error={save.error} />}
      </div>
    </Dialog>
  )
}
