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
  accountingSettingsKey,
  accountingSettingsUrl,
} from '../lib/accounting'
import { api } from '../lib/api'
import { formatDate, isCompleteIsoDate } from '../lib/format'
import { MODULE_PATH } from '../lib/modules'
import type { AccountingSettings } from '../lib/types'

/**
 * In what state the bookkeeping of this tenant is.
 *
 * <p>A state screen and not a settings mask, and the difference is deliberate: the fields
 * `PUT /settings` will carry over the whole series — the equity layout and the carry-forward
 * account — have no subject yet, and a mask that sets nothing must not be called
 * «Einstellungen». What this answers are the three questions a tenant has on the first day: is
 * the module running and where does its switch sit, does any role hold the accounting rights,
 * and can this tenant keep books here at all (backend ADR-0110).
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

      <Panel title="Buchungen sperren" description="Vor diesem Tag wird nichts verbucht.">
        {mayConfigure ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <span className="w-full max-w-[200px]">
                <TextField
                  label="Gesperrt bis"
                  type="date"
                  value={lockedUntil}
                  onChange={(event) => setLockedUntil(event.target.value)}
                  hint="Leer lassen hebt die Sperre auf."
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
            <p className="text-[12px] text-text-secondary">
              Solange kein Geschäftsjahr besteht, wirkt das Datum noch nicht.
            </p>
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

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <dt className="w-[170px] shrink-0 text-text-secondary">{term}</dt>
      <dd className="flex flex-wrap items-center gap-3">{children}</dd>
    </div>
  )
}
