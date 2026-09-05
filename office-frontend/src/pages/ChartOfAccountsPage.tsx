import { useState, type ReactNode } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { KeyRound, Lock, Plus } from 'lucide-react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { CheckboxField } from '../components/CheckboxField'
import { DataTable, type Column } from '../components/DataTable'
import { EmptyState, WarningNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { QuickSearchField } from '../components/QuickSearch'
import { SelectField } from '../components/SelectField'
import { useQuickSearch } from '../components/useQuickSearch'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import {
  ACCOUNTING_MODULE,
  ACCOUNTING_RIGHTS,
  ACCOUNT_TYPE_ORDER,
  accountClassOf,
  accountClassTitle,
  accountTypeLabel,
  ACCOUNTING_SETUP_PATH,
  accountingSettingsKey,
  accountingSettingsUrl,
  accountsKey,
  chartTemplatesKey,
  fetchAccounts,
  fetchChartTemplates,
} from '../lib/accounting'
import { api } from '../lib/api'
import { formatCount } from '../lib/format'
import { emptyPage, listQuery, PAGE_SIZE } from '../lib/paging'
import type {
  Account,
  AccountingSettings,
  ChartTemplate,
  EquityLayout,
} from '../lib/types'
import { useCatalogue, useCatalogueLabel } from '../masterdata/useMasterData'
import { AccountDialog } from './accounting/AccountDialog'
import { ChartTemplateDialog } from './accounting/ChartTemplateDialog'
import { SystemAccountDialog } from './accounting/SystemAccountDialog'

/**
 * The chart of accounts of one tenant: what is booked where, and how the balance sheet and the
 * profit and loss statement are broken down.
 *
 * <p>Flat, and on purpose. The only breakdown that binds is the OR position on the account; the
 * rules this screen draws come from the first digit of the number and are **presentation** —
 * they disappear as soon as somebody sorts by name (backend ADR-0112).
 *
 * <p>Five states, not four. Besides loading, error, no permission and module off there is «Noch
 * kein Kontenplan»: a tenant that has just switched the module on owns no account at all, and an
 * empty table with a search field above it would say nothing about how to get out of that.
 */
export function ChartOfAccountsPage() {
  return (
    <RequireTenant permission={ACCOUNTING_RIGHTS.read} module={ACCOUNTING_MODULE}>
      {(tenantId) => <ChartOfAccounts tenantId={tenantId} />}
    </RequireTenant>
  )
}

function ChartOfAccounts({ tenantId }: { tenantId: number }) {
  const navigate = useNavigate()
  const { can } = useAuth()
  const mayConfigure = can(ACCOUNTING_RIGHTS.configure)

  const search = useQuickSearch()
  const [accountType, setAccountType] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('accountNumber,asc')

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [copying, setCopying] = useState(false)
  const [checkingKeys, setCheckingKeys] = useState(false)
  // «Leer beginnen» closes the fifth state and nothing else. That this choice were stored
  // anywhere does not exist: an empty chart of accounts is an empty chart of accounts.
  const [startedEmpty, setStartedEmpty] = useState(false)

  const types = useCatalogue(tenantId, 'account-type')
  const positionLabel = useCatalogueLabel(tenantId, 'or-position')

  const query = listQuery({
    q: search.term,
    accountType,
    activeOnly,
    page,
    size: PAGE_SIZE,
    sort,
  })
  const accounts = useQuery({
    queryKey: accountsKey(tenantId, query),
    queryFn: () => fetchAccounts(tenantId, query),
    // The accounts found last stay on screen while the next answer is on its way; without it
    // the table is replaced by its loading state on every keystroke.
    placeholderData: keepPreviousData,
  })
  const result = accounts.data ?? emptyPage<Account>()

  // The source note of the chart, the stored equity layout, and — a separate field — what the
  // legal form suggests. The dialog starts on the suggestion and on nothing where there is
  // none. Read with ACCOUNTING_READ and answered while the module is off, like every reading
  // way here.
  const settings = useQuery({
    queryKey: accountingSettingsKey(tenantId),
    queryFn: () => api.get<AccountingSettings>(accountingSettingsUrl(tenantId)),
  })

  // Read up front rather than when the dialog opens: the fifth state names the template it
  // offers, and a heading that appears a moment after the two buttons reads as a fault.
  const templates = useQuery({
    queryKey: chartTemplatesKey(tenantId),
    queryFn: () => fetchChartTemplates(tenantId),
  })

  const filtered = search.term !== '' || accountType !== ''
  // `activeOnly` is deliberately no part of this. A chart whose every account is switched off
  // cannot arise from a template — a system account can be switched off by nobody — and for a
  // hand-built one the endpoint answers 409 and names how many accounts it found.
  const chartIsEmpty = !filtered && accounts.data !== undefined && result.totalElements === 0

  const columns: Column<Account>[] = [
    {
      key: 'number',
      header: 'Nr.',
      sortKey: 'accountNumber',
      width: 'w-[110px]',
      render: (account) => (
        <span className="font-mono text-[12px] text-text-tertiary">{account.accountNumber}</span>
      ),
    },
    {
      key: 'name',
      header: 'Bezeichnung',
      sortKey: 'name',
      render: (account) => <span className="font-medium">{account.name}</span>,
    },
    {
      key: 'type',
      header: 'Art',
      sortKey: 'accountType',
      width: 'w-[130px]',
      render: (account) => (
        <span className="text-text-secondary">{accountTypeLabel(types, account.accountType)}</span>
      ),
    },
    {
      key: 'position',
      header: 'Erscheint unter',
      sortKey: 'orPosition',
      hideBelow: 'sm',
      render: (account) => (
        <span className="text-text-secondary">{positionLabel(account.orPosition)}</span>
      ),
    },
    {
      key: 'state',
      header: '',
      width: 'w-[150px]',
      render: (account) => (
        <span className="flex flex-wrap items-center justify-end gap-1">
          {/* The mark on 9200, and no field: whoever set `direct_posting_allowed` by hand would
              lose an account from every picker without an explanation. */}
          {!account.directPostingAllowed && (
            <span
              className="inline-flex items-center gap-1 text-[11px] text-text-tertiary"
              title="nur fürs System — der Abschluss bucht darauf"
            >
              <Lock size={12} aria-hidden />
              nur fürs System
            </span>
          )}
          {!account.active && <Badge tone="muted">Deaktiviert</Badge>}
        </span>
      ),
    },
  ]

  // The fifth state, and a branch of the tree below rather than a return of its own.
  const noChartYet = chartIsEmpty && !startedEmpty

  // A barred tenant is offered nothing. AccountingSettingsDto fills either the settings or the
  // blocker and never both, so without this the fifth state stands there with «Aus der Vorlage
  // anlegen» on an undefined layout and the way ends in the 400 of the backend. The bar can
  // appear on a tenant that had a normal screen yesterday: the ledger currency is read afresh
  // on every look, so correcting the tenant to EUR bars it from here on (OR Art. 958d Abs. 3).
  if (settings.data?.blocker) {
    return (
      <>
        <Header total={0} />
        <div className="px-8 pb-12">
          <WarningNotice>
            <strong>Dieser Mandant kann hier keine Bücher führen.</strong>{' '}
            {settings.data.blocker}{' '}
            <Link
              to={`/mandanten/${tenantId}`}
              className="text-accent-text underline-offset-2 hover:underline"
            >
              Mandant → Grunddaten
            </Link>
          </WarningNotice>
        </div>
      </>
    )
  }

  return (
    <>
      {noChartYet ? (
        <>
          <Header total={0} />
          <div className="px-8 pb-12">
            <Panel padded={false}>
              <NoChartYet
                template={firstTemplate(templates.data)}
                layout={settings.data?.equityLayout}
                mayConfigure={mayConfigure}
                onCopy={() => setCopying(true)}
                onStartEmpty={() => setStartedEmpty(true)}
                onSetUp={() => void navigate(ACCOUNTING_SETUP_PATH)}
              />
            </Panel>
          </div>
        </>
      ) : (
        <>
          <Header total={result.totalElements}>
            <Button variant="secondary" onClick={() => setCheckingKeys(true)}>
              <KeyRound size={15} aria-hidden />
              Systemkonten prüfen
            </Button>
            {mayConfigure && (
              <Button onClick={() => setCreating(true)}>
                <Plus size={15} aria-hidden />
                Konto anlegen
              </Button>
            )}
          </Header>

          <div className="px-8 pb-12">
            <Panel padded={false}>
              <div className="flex flex-wrap items-end gap-4 border-b border-line-subtle px-5 py-4">
                <QuickSearchField
                  value={search.value}
                  onChange={(next) => {
                    search.setValue(next)
                    setPage(0)
                  }}
                  placeholder="Nummer oder Bezeichnung"
                  maxLength={120}
                />
                <SelectField
                  label="Kontoart"
                  value={accountType}
                  onChange={(event) => {
                    setAccountType(event.target.value)
                    setPage(0)
                  }}
                  className="w-[180px]"
                >
                  <option value="">Alle</option>
                  {ACCOUNT_TYPE_ORDER.map((code) => (
                    <option key={code} value={code}>
                      {accountTypeLabel(types, code)}
                    </option>
                  ))}
                </SelectField>
                <CheckboxField
                  label="Nur aktive"
                  checked={activeOnly}
                  onChange={(event) => {
                    setActiveOnly(event.target.checked)
                    setPage(0)
                  }}
                  className="h-10 items-center"
                />
              </div>

              <DataTable
                columns={columns}
                rows={result.content}
                keyOf={(account) => account.id}
                onRowOpen={(account) => setEditing(account)}
                // Only while the list stands in the order the rules describe. Sorted by name they
                // would cut the alphabet into nine pieces for no reason.
                sectionTitle={
                  sort.startsWith('accountNumber')
                    ? (account) => headingOf(account.accountNumber)
                    : undefined
                }
                page={result}
                onPageChange={setPage}
                sort={sort}
                onSortChange={(next) => {
                  setSort(next)
                  setPage(0)
                }}
                loading={accounts.isPending}
                error={accounts.error}
                footer={
                  settings.data?.chartSource && (
                    <tr>
                      <td
                        colSpan={columns.length}
                        className="px-5 py-3 text-[12px] leading-[18px] text-text-secondary"
                      >
                        {settings.data.chartSource}
                      </td>
                    </tr>
                  )
                }
                empty={
                  <EmptyState
                    title={filtered ? 'Nichts gefunden' : 'Noch kein Konto'}
                    description={
                      filtered
                        ? 'Kein Konto passt zu dieser Suche.'
                        : 'Ohne Konto lässt sich nichts buchen. Der Assistent führt in drei '
                          + 'Schritten durch Kontenplan, Geschäftsjahr und Eröffnung.'
                    }
                  >
                    {!filtered && mayConfigure && (
                      <span className="flex flex-wrap justify-center gap-2">
                        {/* First, and deliberately: whoever has nothing yet wants the three
                            steps rather than the first of thirty accounts. */}
                        <Button onClick={() => void navigate(ACCOUNTING_SETUP_PATH)}>
                          Buchhaltung einrichten
                        </Button>
                        <Button variant="secondary" onClick={() => setCreating(true)}>
                          <Plus size={15} aria-hidden />
                          Erstes Konto anlegen
                        </Button>
                        {/* «Leer beginnen» stores nothing, so the way through the template stays
                            open as long as there is no account yet. */}
                        {templates.data !== undefined && templates.data.length > 0 && (
                          <Button variant="secondary" onClick={() => setCopying(true)}>
                            Aus der Vorlage anlegen
                          </Button>
                        )}
                      </span>
                    )}
                  </EmptyState>
                }
              />
            </Panel>
          </div>
        </>
      )}

      {/* The three dialogs stand outside the two states above, and that is the point. While one
          is open the chart may stop being empty under it — a second session copies the template,
          and the answer to that is a 409 with a sentence worth reading. Drawn inside the branch,
          the refreshed list would remount the box and take the sentence with it. */}
      {copying && (
        <ChartTemplateDialog
          tenantId={tenantId}
          templates={templates.data ?? []}
          suggestedLayout={settings.data?.suggestedEquityLayout}
          onClose={() => setCopying(false)}
        />
      )}
      {(creating || editing !== null) && (
        <AccountDialog
          tenantId={tenantId}
          account={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
        />
      )}
      {checkingKeys && (
        <SystemAccountDialog tenantId={tenantId} onClose={() => setCheckingKeys(false)} />
      )}
    </>
  )
}

/** Heading and actions, the same in every state of this screen. */
function Header({ total, children }: { total: number; children?: ReactNode }) {
  return (
    <PageHeader
      title="Kontenplan"
      subtitle={
        total === 0
          ? 'Wohin gebucht wird, und wie Bilanz und Erfolgsrechnung gegliedert sind.'
          : `${formatCount(total)} Konten`
      }
    >
      {children}
    </PageHeader>
  )
}

/**
 * The fifth state: the module runs, and there is no account yet.
 *
 * <p>**Every word about the template is rendered, none is typed.** Name, edition and the number
 * of accounts come from `GET /chart-templates`; where it answers no template, the way in through
 * the template and its sentence disappear and «Leer beginnen» is left. So a template that is not
 * shipped is never named (backend ADR-0112).
 */
function NoChartYet({
  template,
  layout,
  mayConfigure,
  onCopy,
  onStartEmpty,
  onSetUp,
}: {
  template: ChartTemplate | undefined
  layout: EquityLayout | undefined
  mayConfigure: boolean
  onCopy: () => void
  onStartEmpty: () => void
  onSetUp: () => void
}) {
  const rows = template === undefined ? undefined : countFor(template, layout)

  return (
    <EmptyState
      title="Noch kein Kontenplan"
      description="Ein Kontenplan sagt, wohin gebucht wird und wie Bilanz und Erfolgsrechnung gegliedert sind. Der Assistent führt in drei Schritten durch Kontenplan, Geschäftsjahr und Eröffnung."
    >
      <div className="grid justify-items-center gap-4">
        <div className="flex flex-wrap justify-center gap-2">
          {/* First, and deliberately: whoever lands here has nothing at all yet, and the three
              steps are the shorter way than three screens found one by one. */}
          <Button onClick={onSetUp}>Buchhaltung einrichten</Button>
          {template !== undefined && mayConfigure && (
            <Button variant="secondary" onClick={onCopy}>
              Aus der Vorlage anlegen
            </Button>
          )}
          <Button variant="secondary" onClick={onStartEmpty}>
            Leer beginnen
          </Button>
        </div>
        {template !== undefined && (
          <p className="max-w-[52ch] text-[13px] text-text-secondary">
            Die Vorlage «{template.name}»{rows === undefined ? '' : ` bringt ${rows} Konten mit`}.
            Sie lässt sich danach beliebig ändern, ergänzen und kürzen.
          </p>
        )}
      </div>
    </EmptyState>
  )
}

/**
 * The template the empty state names: the one with the smallest sort order.
 *
 * <p>Undefined where none is shipped — that is a state, not a fault.
 */
function firstTemplate(templates: ChartTemplate[] | undefined): ChartTemplate | undefined {
  return [...(templates ?? [])].sort((one, other) => one.sortOrder - other.sortOrder)[0]
}

/** How many accounts a copy of this template produces for the equity layout in force. */
function countFor(
  template: ChartTemplate,
  layout: EquityLayout | undefined,
): number | undefined {
  if (layout === undefined) return undefined
  return template.accountCount?.[layout]
}

/** The rule above the first account of a class — «1 Aktiven». */
function headingOf(accountNumber: string): string | undefined {
  const accountClass = accountClassOf(accountNumber)
  if (accountClass === undefined) return undefined
  return `${accountClass} ${accountClassTitle(accountClass)}`
}
