import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { MissingAccountingRightsNotice } from '../components/MissingAccountingRightsNotice'
import { ErrorNotice, LoadingBlock, WarningNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import {
  ACCOUNTING_MODULE,
  ACCOUNTING_RIGHTS,
  CHART_OF_ACCOUNTS_PATH,
  FISCAL_YEARS_PATH,
  accountingSettingsKey,
  accountingSettingsUrl,
  fetchFiscalYears,
  fiscalYearsKey,
} from '../lib/accounting'
import { api } from '../lib/api'
import { formatDate, isCompleteIsoDate } from '../lib/format'
import { MODULE_PATH } from '../lib/modules'
import type { AccountingSettings } from '../lib/types'

/**
 * The settings of the bookkeeping of this tenant, and the state it is in.
 *
 * <p>What this answers are the questions a tenant has on the first day: is the module running
 * and where does its switch sit, does any role hold the accounting rights, can this tenant keep
 * books here at all, and from which day on is posting locked (backend ADR-0110).
 *
 * <p>Since the fiscal year the menu entry is called «Einstellungen» rather than «Zustand»: the
 * lock date has an effect from here on. The address never moved.
 *
 * <p>No empty state: `GET /settings` always has an answer.
 */
export function AccountingStatePage() {
  return (
    <RequireTenant permission={ACCOUNTING_RIGHTS.read} module={ACCOUNTING_MODULE}>
      {(tenantId) => <AccountingState tenantId={tenantId} />}
    </RequireTenant>
  )
}

function AccountingState({ tenantId }: { tenantId: number }) {
  const settings = useQuery({
    queryKey: accountingSettingsKey(tenantId),
    queryFn: () => api.get<AccountingSettings>(accountingSettingsUrl(tenantId)),
  })

  if (settings.error !== null) {
    return (
      <Frame>
        <ErrorNotice error={settings.error} />
      </Frame>
    )
  }

  if (settings.data === undefined) {
    return (
      <Frame>
        <LoadingBlock />
      </Frame>
    )
  }

  // The tenant cannot keep books here at all. Then this sentence stands alone: the missing
  // rights are a problem for another day, and two warnings above one another read as a broken
  // mask.
  if (settings.data.blocker) {
    return (
      <Frame>
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
      </Frame>
    )
  }

  // Keyed on what is stored, like the dunning settings: what somebody typed has to give way
  // once a save or another user has rewritten the state underneath it.
  return (
    <Frame>
      <State
        key={settings.data.postingsLockedUntil ?? ''}
        tenantId={tenantId}
        stored={settings.data}
      />
    </Frame>
  )
}

/** Heading and page padding, the same in every state of this screen. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader
        title="Buchhaltung"
        subtitle="In welchem Zustand die Buchhaltung dieses Mandanten ist."
      />
      <div className="grid gap-4 px-8 pb-12">{children}</div>
    </>
  )
}

function State({ tenantId, stored }: { tenantId: number; stored: AccountingSettings }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayConfigure = can(ACCOUNTING_RIGHTS.configure)

  const [lockedUntil, setLockedUntil] = useState(stored.postingsLockedUntil ?? '')

  const save = useMutation({
    // `null` and not an omitted field: the payload carries this one value, so «nicht genannt»
    // and «geleert» cannot be told apart — and a bolt that survives an empty save silently is
    // the worse of the two mistakes (backend ADR-0119).
    mutationFn: (day: string) =>
      api.put<AccountingSettings>(accountingSettingsUrl(tenantId), {
        postingsLockedUntil: day === '' ? null : day,
      }),
    onSuccess: (settings) => {
      queryClient.setQueryData(accountingSettingsKey(tenantId), settings)
      // The bolt that was just moved is one of the three the posting boundary is worked out
      // from, and both screens read that boundary out of the fiscal year answer. Left cached,
      // «Buchhaltung → Geschäftsjahre» would go on naming yesterday's day.
      void queryClient.invalidateQueries({ queryKey: fiscalYearsKey(tenantId) })
    },
  })

  const typed = lockedUntil.trim()
  const complete = typed === '' || isCompleteIsoDate(typed)
  const changed = typed !== (stored.postingsLockedUntil ?? '')

  return (
    <>
      <Panel title="Zustand">
        <dl className="grid gap-3 text-[13px]">
          {/* Can only ever read «eingeschaltet»: folder and entry carry the module switch, and
              a typed address is caught by `RequireTenant`. The row stays all the same — it
              answers the first question of every enquiry, and it carries the way out. */}
          <Row term="Modul">
            <Badge tone="success">Eingeschaltet</Badge>
            <Link
              to={MODULE_PATH}
              className="text-accent-text underline-offset-2 hover:underline"
            >
              Systemeinstellungen → Module
            </Link>
          </Row>
          <Row term="Buchführungswährung">
            <span className="font-mono tabular-nums">{stored.ledgerCurrency}</span>
          </Row>
        </dl>

        <div className="mt-4 empty:hidden">
          <MissingAccountingRightsNotice tenantId={tenantId} />
        </div>
      </Panel>

      {/* «Bis und mit» and not «vor»: the backend refuses a booking date that is not after
          the bolt, so the named day is itself locked (AccountingRules). */}
      <Panel
        title="Buchungen sperren"
        description="Bis und mit diesem Tag wird nichts verbucht."
      >
        {mayConfigure ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <span className="w-full max-w-[200px]">
                <TextField
                  label="Gesperrt bis"
                  type="date"
                  value={lockedUntil}
                  onChange={(event) => setLockedUntil(event.target.value)}
                  hint="Dieser Tag ist mitgesperrt. Leer lassen hebt die Sperre auf."
                />
              </span>
              <Button
                onClick={() => save.mutate(typed)}
                busy={save.isPending}
                disabled={!complete || !changed}
              >
                Speichern
              </Button>
            </div>
            {save.error !== null && <ErrorNotice error={save.error} />}
          </div>
        ) : (
          <div className="grid gap-3 text-[13px]">
            <p>
              Gesperrt bis{' '}
              <span className="font-mono tabular-nums">
                {stored.postingsLockedUntil
                  ? formatDate(stored.postingsLockedUntil)
                  : 'nicht gesetzt'}
              </span>
            </p>
            <p className="text-[12px] text-text-secondary">
              Ändern lässt sich das Datum mit dem Recht{' '}
              <span className="font-mono text-[12px]">{ACCOUNTING_RIGHTS.configure}</span>.
            </p>
          </div>
        )}
      </Panel>

      <FiscalYearSection tenantId={tenantId} />

      {/* The honest sentence of this stage: the chart is there, the postings are not. */}
      <Panel title="Als Nächstes">
        <p className="text-[13px] leading-[20px] text-text-secondary">
          Einen{' '}
          <Link
            to={CHART_OF_ACCOUNTS_PATH}
            className="text-accent-text underline-offset-2 hover:underline"
          >
            Kontenplan
          </Link>{' '}
          anlegen — aus einer Vorlage oder von Hand. Gebucht wird noch nichts; das kommt mit dem
          Geschäftsjahr, und das ist so gewollt.
        </p>
      </Panel>
    </>
  )
}

/**
 * How much time is left on the last fiscal year — the same warning the fiscal year screen shows.
 *
 * <p>ENTSCHEID 2 asks for it in two places: on the screen of the years and on the one that
 * answers the state of the module. Both read the <b>same</b> query key, so there is one cached
 * answer and not two that drift apart, and the thirty days are counted in the backend
 * (`FiscalYearRules.WARN_DAYS`) and nowhere here.
 */
function FiscalYearSection({ tenantId }: { tenantId: number }) {
  const years = useQuery({
    queryKey: fiscalYearsKey(tenantId),
    queryFn: () => fetchFiscalYears(tenantId),
  })

  const last = [...(years.data?.years ?? [])].sort((a, b) =>
    a.endDate < b.endDate ? 1 : -1,
  )[0]

  return (
    <Panel title="Geschäftsjahr">
      {years.error !== null ? (
        <ErrorNotice error={years.error} />
      ) : years.data === undefined ? (
        <LoadingBlock />
      ) : (
        <div className="grid gap-3 text-[13px]">
          {years.data.expiry.warn && (
            <WarningNotice>
              {(years.data.expiry.daysLeft ?? 0) < 0 ? (
                <>
                  <strong>
                    Das letzte Geschäftsjahr endete am{' '}
                    {formatDate(years.data.expiry.lastEndDate)}.
                  </strong>{' '}
                  Seither lässt sich nichts mehr buchen, bis das Folgejahr angelegt ist.
                </>
              ) : (
                <>
                  <strong>
                    Das letzte Geschäftsjahr endet am{' '}
                    {formatDate(years.data.expiry.lastEndDate)}.
                  </strong>{' '}
                  Danach lässt sich nichts mehr buchen, bis das Folgejahr angelegt ist.
                </>
              )}
            </WarningNotice>
          )}
          {last === undefined ? (
            <p className="text-text-secondary">
              Solange kein Geschäftsjahr besteht, wirkt das Datum noch nicht.
            </p>
          ) : (
            <p>
              Letztes Geschäftsjahr: <span className="font-medium">{last.label}</span>, bis{' '}
              <span className="font-mono tabular-nums">{formatDate(last.endDate)}</span>
            </p>
          )}
          <p>
            <Link
              to={FISCAL_YEARS_PATH}
              className="text-accent-text underline-offset-2 hover:underline"
            >
              Buchhaltung → Geschäftsjahre
            </Link>
          </p>
        </div>
      )}
    </Panel>
  )
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <dt className="w-[170px] shrink-0 text-text-secondary">{term}</dt>
      <dd className="flex flex-wrap items-center gap-3">{children}</dd>
    </div>
  )
}
