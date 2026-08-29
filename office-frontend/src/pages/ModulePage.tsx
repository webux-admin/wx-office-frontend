import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../components/Button'
import { CheckboxField } from '../components/CheckboxField'
import { Dialog } from '../components/Dialog'
import { ErrorNotice, LoadingBlock } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { TextField } from '../components/TextField'
import { useSubmitShortcut } from '../components/useSubmitShortcut'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { parseDecimal } from '../lib/format'
import { MODULE_RIGHTS, tenantModulesKey, tenantModulesUrl } from '../lib/modules'
import type { Tenant, TenantModule } from '../lib/types'

/**
 * What stops working when a module goes off, one sentence per module.
 *
 * <p>Written here and not sent by the backend: `label` and `description` say what a module *is*
 * and belong to the catalogue, while this says what a *screen* stops doing. It lives beside the
 * dialog that shows it, the way the menu texts live in `navigation.ts` (ADR-0018).
 *
 * <p>Keyed by the backend code. A module without a sentence gets the neutral one — a missing
 * entry must never turn the dialog into the warning of another module, which is what happened
 * while this text was a fixed paragraph about the stock.
 */
const CONSEQUENCES: Record<string, string> = {
  INVENTORY:
    'Lieferscheine buchen danach keinen Abgang mehr, und der Bestand läuft auseinander. ' +
    'Die gebuchten Bewegungen bleiben erhalten — gelöscht wird nichts.',
  OUTBOX:
    'Belege lassen sich danach nicht mehr per E-Mail versenden, und was in der Warteschlange ' +
    'steht, bleibt dort liegen. Gesendete Nachrichten bleiben lesbar — gelöscht wird nichts.',
  DUNNING:
    'Es lässt sich danach nicht mehr gemahnt werden, und die Mahnstufen sind nicht mehr ' +
    'änderbar. Mahnstufen, Einstellungen und ausgestellte Mahnungen bleiben erhalten und ' +
    'lesbar — gelöscht wird nichts.',
}

/** The neutral sentence, for a module nobody wrote one for. */
const CONSEQUENCE_FALLBACK =
  'Was im Modul liegt, bleibt erhalten — gelöscht wird nichts.'

function consequenceOf(code: string): string {
  return CONSEQUENCES[code] ?? CONSEQUENCE_FALLBACK
}

/**
 * Which modules this tenant runs.
 *
 * <p>Its own screen rather than a checkbox on the tenant form: a switch that decides whether a
 * whole part of the application exists is not a field beside the invoice footer, and a second
 * module would have nowhere to go (backend ADR-0079, frontend ADR-0018).
 *
 * <p>Under `RequireTenant` and not `RequirePermission`: every request of this screen goes to
 * `/api/tenants/{id}/…`, and a superuser who has not chosen a tenant would otherwise build
 * `/api/tenants/null/modules`.
 */
export function ModulePage() {
  return (
    <RequireTenant permission={MODULE_RIGHTS.read}>
      {(tenantId) => <Modules tenantId={tenantId} />}
    </RequireTenant>
  )
}

/** What the screen has changed but not yet saved, by module code. */
type ModuleEdits = Record<string, boolean>

/** The two count thresholds, as typed. */
type ThresholdEdits = { percent: string; minimum: string }

function Modules({ tenantId }: { tenantId: number }) {
  const { can, refresh } = useAuth()
  const queryClient = useQueryClient()
  const mayWrite = can(MODULE_RIGHTS.write)

  const [edits, setEdits] = useState<ModuleEdits>({})
  const [thresholds, setThresholds] = useState<ThresholdEdits | null>(null)
  const [pending, setPending] = useState<TenantModule | null>(null)

  const modules = useQuery({
    queryKey: tenantModulesKey(tenantId),
    queryFn: () => api.get<TenantModule[]>(tenantModulesUrl(tenantId)),
  })

  // The two count thresholds stay tenant columns and travel in the tenant payload; only the
  // screen they are shown on moves here, where the switch they belong to now lives
  // (backend ADR-0074 foresaw exactly this move).
  const tenant = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => api.get<Tenant>(`/api/tenants/${tenantId}`),
  })

  const rows = modules.data ?? []
  const stored = (module: TenantModule) => edits[module.code] ?? module.active
  const runsInventory = rows.some((module) => module.code === 'INVENTORY' && stored(module))

  const storedThresholds: ThresholdEdits = {
    percent: tenant.data?.stocktakeReasonPercent?.toString() ?? '5',
    minimum: tenant.data?.stocktakeReasonMinimum?.toString() ?? '1',
  }
  const typed = thresholds ?? storedThresholds
  const thresholdsChanged =
    thresholds !== null &&
    (thresholds.percent !== storedThresholds.percent ||
      thresholds.minimum !== storedThresholds.minimum)
  const changes = Object.keys(edits).length + (thresholdsChanged ? 1 : 0)

  const save = useMutation({
    mutationFn: async () => {
      if (Object.keys(edits).length > 0) {
        await api.put<TenantModule[]>(tenantModulesUrl(tenantId), {
          modules: Object.entries(edits).map(([code, active]) => ({ code, active })),
        })
      }
      // A payload naming only these two fields. Everything it leaves out stays as it is —
      // that is the rule the backend follows for a missing field (ADR-0074).
      if (thresholdsChanged) {
        await api.put<Tenant>(`/api/tenants/${tenantId}`, {
          stocktakeReasonPercent: parseDecimal(typed.percent) ?? undefined,
          stocktakeReasonMinimum: parseDecimal(typed.minimum) ?? undefined,
        })
      }
    },
    // The mask stays open: opened from the menu, it has no screen to return to. Instead the
    // edits are cleared and everything that reads the state is asked again — the session
    // included, or the sidebar would keep the old list until somebody reloads.
    onSuccess: () => {
      setEdits({})
      setThresholds(null)
      void queryClient.invalidateQueries({ queryKey: tenantModulesKey(tenantId) })
      void queryClient.invalidateQueries({ queryKey: ['tenant'] })
      void refresh()
    },
  })

  const submit = () => save.mutate()
  useSubmitShortcut(mayWrite && !save.isPending && changes > 0 ? submit : undefined)

  /** Records one switch, and drops the entry again where it matches what is stored. */
  const toggle = (module: TenantModule, active: boolean) => {
    setEdits((current) => {
      const next = { ...current }
      if (active === module.active) delete next[module.code]
      else next[module.code] = active
      return next
    })
  }

  /** Switching off asks first, but only where something lies in the module. */
  const request = (module: TenantModule, active: boolean) => {
    if (!active && module.usage) {
      setPending(module)
      return
    }
    toggle(module, active)
  }

  return (
    <>
      <PageHeader title="Module" subtitle="Welche Teile der Anwendung dieser Mandant betreibt">
        {mayWrite && (
          <div className="flex items-center gap-3">
            <span aria-live="polite" className="text-[12px] text-text-secondary">
              {changes === 0
                ? 'Keine Änderungen'
                : `${changes} Änderung${changes === 1 ? '' : 'en'}`}
            </span>
            <Button onClick={submit} busy={save.isPending} disabled={changes === 0} shortcut>
              Speichern
            </Button>
          </div>
        )}
      </PageHeader>

      {save.error !== null && <ErrorNotice error={save.error} />}
      {modules.isPending && <LoadingBlock />}
      {modules.error !== null && <ErrorNotice error={modules.error} />}

      {!modules.isPending &&
        modules.error === null &&
        rows.map((module) => (
          <Panel key={module.code} title={module.label} className="mt-4">
            <CheckboxField
              label={`${module.label} verwenden`}
              hint={module.description}
              checked={stored(module)}
              onChange={(event) => request(module, event.target.checked)}
              disabled={!mayWrite || save.isPending}
            />
            {module.usage !== undefined && (
              <p className="mt-2 text-[12px] text-text-secondary">
                Im Modul liegen bereits: {module.usage}.
              </p>
            )}
            {module.code === 'INVENTORY' && runsInventory && (
              <>
                {/* From when a counted difference has to be explained. Two values rather than
                    one: a percentage alone asks for an explanation of every single piece on
                    small expected quantities, an absolute floor alone lets everything through
                    on large ones (backend ADR-0070). They stand here, beside the switch they
                    belong to, since the switch left the tenant form (ADR-0074). */}
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <TextField
                    label="Begründungspflicht ab"
                    value={typed.percent}
                    onChange={(event) =>
                      setThresholds({ ...typed, percent: event.target.value })
                    }
                    disabled={!mayWrite}
                    inputMode="decimal"
                    numeric
                    hint="In Prozent der Sollmenge: bei 5 % fragt die Inventur ab 5 Stück Abweichung auf 100 Soll nach einem Grund. 0 % heisst: bei jeder Abweichung."
                  />
                  <TextField
                    label="Untergrenze der Begründungspflicht"
                    value={typed.minimum}
                    onChange={(event) =>
                      setThresholds({ ...typed, minimum: event.target.value })
                    }
                    disabled={!mayWrite}
                    inputMode="decimal"
                    numeric
                    hint="Eine Menge, kein Prozentsatz: kleinere Abweichungen bleiben ohne Grund, auch bei 0 %. Bei 1 wird ein fehlendes halbes Kilo nie erklärt."
                  />
                </div>
              </>
            )}
          </Panel>
        ))}

      {/* Warns with figures, and does not block: what lies in the module stays where it is,
          and the retention period forbids the opposite anyway (backend ADR-0079). */}
      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending === null ? '' : `${pending.label} abschalten?`}
        description={pending === null ? undefined : `Im Modul liegen bereits: ${pending.usage}.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>
              Abbrechen
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (pending !== null) toggle(pending, false)
                setPending(null)
              }}
            >
              Abschalten
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-text-secondary">
          {pending === null ? '' : consequenceOf(pending.code)}
        </p>
      </Dialog>
    </>
  )
}
