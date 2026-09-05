import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ErrorNotice, LoadingBlock } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import {
  ACCOUNTING_MODULE,
  ACCOUNTING_RIGHTS,
  ACCOUNTING_SETTINGS_PATH,
  accountingSettingsKey,
  accountingSettingsUrl,
  fetchFiscalYears,
  fetchSetupState,
  fiscalYearsKey,
  FISCAL_YEARS_PATH,
  setupStateKey,
} from '../lib/accounting'
import { api } from '../lib/api'
import type { AccountingSettings, SetupState, SetupStep, Tenant } from '../lib/types'
import { EquityAndChartStep } from './accounting/EquityAndChartStep'
import { FiscalYearStep } from './accounting/FiscalYearStep'
import { OpeningEntryStep } from './accounting/OpeningEntryStep'

/**
 * «Buchhaltung einrichten»: three steps from an empty system to a balance sheet that adds up.
 *
 * <p><b>No menu entry, and that is decided.</b> An entry for something a tenant does once in its
 * life would stand there for ever afterwards. The four ways in are the empty states of «Buchen»,
 * of the chart of accounts and of the fiscal years, and the notice on a filled fiscal year screen
 * that carries no opening entry — the last of them is what keeps step 3 reachable at all for
 * somebody who laid the first two out by hand.
 *
 * <p><b>No state of its own.</b> Every step saves real records through the endpoints that exist
 * anyway; there is no draft of the wizard. Whoever breaks off keeps what is finished, and the way
 * back in starts at the first unfinished step — which is a reading of the books, not of a note
 * about them.
 *
 * <p><b>Each step says which right it is missing</b> rather than a `ForbiddenNotice` covering the
 * whole screen: whoever may only read still sees where the tenant stands, and that is the more
 * useful answer.
 */
export function AccountingSetupPage() {
  return (
    <RequireTenant permission={ACCOUNTING_RIGHTS.read} module={ACCOUNTING_MODULE}>
      {(tenantId) => <Setup tenantId={tenantId} />}
    </RequireTenant>
  )
}

/** The three steps, in the order the law and the data force them into. */
const STEPS: readonly { step: SetupStep; title: string }[] = [
  { step: 'EQUITY_AND_CHART', title: 'Eigenkapital und Kontenplan' },
  { step: 'FISCAL_YEAR', title: 'Geschäftsjahr' },
  { step: 'OPENING', title: 'Eröffnung' },
]

function Setup({ tenantId }: { tenantId: number }) {
  const navigate = useNavigate()
  const { can } = useAuth()
  // What the person navigated to, and `null` while they have not: then the books decide.
  const [stepped, setStepped] = useState<SetupStep | null>(null)

  const state = useQuery({
    queryKey: setupStateKey(tenantId),
    queryFn: () => fetchSetupState(tenantId),
  })
  const years = useQuery({
    queryKey: fiscalYearsKey(tenantId),
    queryFn: () => fetchFiscalYears(tenantId),
  })
  const settings = useQuery({
    queryKey: accountingSettingsKey(tenantId),
    queryFn: () => api.get<AccountingSettings>(accountingSettingsUrl(tenantId)),
  })
  // What the master record says, shown beside the equity question and not read into it. Reading
  // a tenant is `TENANT_READ`, which a bookkeeper need not hold; without it the line stays away.
  const tenant = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => api.get<Tenant>(`/api/tenants/${tenantId}`),
    enabled: can('TENANT_READ'),
  })

  // Worked out during render and never written into state by an effect: while nobody has
  // navigated, the books say where to start; the moment somebody does, their choice wins. A late
  // answer therefore cannot throw them back to a step they have just left.
  const at: SetupStep | null =
    stepped ?? (state.data === undefined ? null : openingAt(state.data.nextStep))

  // The error first: without it a failed request would fall into the loading branch below and
  // spin for ever, because `at` stays null while there is no answer.
  if (state.error !== null && state.error !== undefined) {
    return (
      <div className="px-8 pb-12">
        <ErrorNotice error={state.error} />
      </div>
    )
  }
  // Every step pre-fills from one of these answers, and every pre-fill is read once when the step
  // mounts. Rendering before they are in would put an unanswered equity question and a fiscal year
  // starting on 1 January in front of somebody whose books start in July.
  const waiting =
    at === null
    || settings.isPending
    || (can('TENANT_READ') && tenant.isPending)
    || years.isPending
  if (waiting) return <LoadingBlock />

  const data = state.data as SetupState
  const index = STEPS.findIndex((entry) => entry.step === at)

  return (
    <>
      <PageHeader
        title="Buchhaltung einrichten"
        subtitle={`Schritt ${index + 1} von 3 — in drei Schritten von einem leeren System zu einer Bilanz, die aufgeht.`}
        back={{ to: ACCOUNTING_SETTINGS_PATH, label: 'Buchhaltung' }}
      />

      <div className="grid gap-5 px-8 pb-12">
        <StepBar at={at} state={data} />

        {at === 'EQUITY_AND_CHART' && (
          <EquityAndChartStep
            tenantId={tenantId}
            suggestedLayout={settings.data?.suggestedEquityLayout}
            storedLayout={data.accountCount > 0 ? settings.data?.equityLayout : undefined}
            legalForm={tenant.data?.legalFormLabel}
            accountCount={data.accountCount}
            onDone={() => setStepped('FISCAL_YEAR')}
            onCancel={() => void navigate(ACCOUNTING_SETTINGS_PATH)}
          />
        )}

        {at === 'FISCAL_YEAR' && (
          <FiscalYearStep
            tenantId={tenantId}
            years={years.data?.years ?? []}
            fiscalYearStartMonth={tenant.data?.fiscalYearStartMonth ?? 1}
            onDone={() => setStepped('OPENING')}
            onBack={() => setStepped('EQUITY_AND_CHART')}
          />
        )}

        {at === 'OPENING' &&
          (data.fiscalYear ? (
            <OpeningEntryStep
              tenantId={tenantId}
              fiscalYear={data.fiscalYear}
              suggestion={data.openingSuggestion}
              ledgerCurrency={settings.data?.ledgerCurrency ?? 'CHF'}
              existing={data.openingEntry}
              storedStartsOn={data.postingStartsOn}
              onDone={() => void navigate(FISCAL_YEARS_PATH)}
              onBack={() => setStepped('FISCAL_YEAR')}
            />
          ) : (
            <ErrorNotice
              error={
                new Error(
                  'Für die Eröffnung braucht es ein Geschäftsjahr. Gehen Sie einen Schritt zurück.',
                )
              }
            />
          ))}
      </div>
    </>
  )
}

/**
 * Where a finished wizard opens: on its last step rather than on nothing.
 *
 * <p>A tenant that is set up can still come back — from the notice on the fiscal year screen, to
 * replace an opening entry — and landing on step 1 would ask it to choose an equity layout it
 * answered a year ago.
 */
function openingAt(next: SetupStep): SetupStep {
  return next === 'DONE' ? 'OPENING' : next
}

/** Where the person is, and what is already done — read off the books rather than off a counter. */
function StepBar({ at, state }: { at: SetupStep; state: SetupState }) {
  const done: Record<SetupStep, boolean> = {
    EQUITY_AND_CHART: state.accountCount > 0,
    FISCAL_YEAR: state.fiscalYear !== null && state.fiscalYear !== undefined,
    OPENING: state.nextStep === 'DONE',
    DONE: false,
  }
  return (
    <ol className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
      {STEPS.map((entry) => (
        <li key={entry.step} className="flex items-center gap-1.5">
          <span
            className={`grid h-4 w-4 place-items-center rounded-[var(--radius-full)] text-[10px] ${
              done[entry.step]
                ? 'bg-accent text-white'
                : entry.step === at
                  ? 'bg-text-primary text-surface'
                  : 'bg-sunken text-text-tertiary'
            }`}
            aria-hidden
          >
            {done[entry.step] ? <Check size={11} /> : '•'}
          </span>
          <span className={entry.step === at ? 'font-medium' : 'text-text-secondary'}>
            {entry.title}
          </span>
        </li>
      ))}
    </ol>
  )
}
