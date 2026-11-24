import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { DataTable, type Column } from '../components/DataTable'
import { Dialog } from '../components/Dialog'
import { DialogCancelButton } from '../components/DialogCancelButton'
import { EmptyState, ErrorNotice, LoadingBlock } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { SelectField } from '../components/SelectField'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { fieldErrorsOf, isToldByFields } from '../lib/fieldErrors'
import { formatDateTime } from '../lib/format'
import {
  BILLING_INCREMENTS,
  billingIncrementLabel,
  incrementSavedText,
  timeBillingKey,
  timeTrackingSettingsKey,
  timeTrackingSettingsUrl,
} from '../lib/timeBilling'
import {
  TIMETRACKING_MODULE,
  TIMETRACKING_RIGHTS,
  userDefaultState,
  userDefaultUrl,
  userDefaultsKey,
  userDefaultsUrl,
} from '../lib/timetracking'
import type {
  TimeBillingSettings,
  TimeBillingSettingsRequest,
  TimeServiceChoice,
  TimeUserDefault,
  TimeUserDefaultRequest,
} from '../lib/types'
import { ServiceLookup } from '../timetracking/AssignmentFields'

/**
 * «Zeiterfassung» under the module settings: the billing increment and the default service of
 * every user.
 *
 * <p>The increment rounds up each entry on the invoice only; the entry keeps the time as
 * measured (#122, Entscheid 10, backend ADR-0163). The default service is what the quick line
 * suggests on a project or customer where the user has taken nothing yet. «Beratung Senior» for
 * one person and «Beratung Junior» for another gives each their own rate through the price of the
 * service, without a third place for prices (backend ADR-0162).
 *
 * <p>With `TIME_WRITE`: the table names every user of the tenant, and keeping the defaults and the
 * increment is part of keeping the times of others.
 */
export function TimeTrackingSettingsPage() {
  return (
    <RequireTenant permission={TIMETRACKING_RIGHTS.write} module={TIMETRACKING_MODULE}>
      {(tenantId) => (
        <>
          <PageHeader
            title="Zeiterfassung"
            subtitle="Was für die Zeiten aller Benutzer gilt: wie sie verrechnet werden und welche Leistung «Meine Zeiten» vorschlägt."
          />
          <div className="grid gap-4 px-8 pb-12">
            <BillingIncrement tenantId={tenantId} />
            <UserDefaults tenantId={tenantId} />
          </div>
        </>
      )}
    </RequireTenant>
  )
}

/**
 * The billing increment: none, or 5, 6, 10, 15 or 30 minutes, saved on its own.
 *
 * <p>Held as typed until it is saved; a stored increment read anew — after a refusal, or a change
 * by somebody else — fills the choice again.
 */
function BillingIncrement({ tenantId }: { tenantId: number }) {
  const queryClient = useQueryClient()
  const settings = useQuery({
    queryKey: timeTrackingSettingsKey(tenantId),
    queryFn: () => api.get<TimeBillingSettings>(timeTrackingSettingsUrl(tenantId)),
  })
  const stored = settings.data?.billingIncrementMinutes
  const [chosen, setChosen] = useState<number | null>(null)
  const [shownStored, setShownStored] = useState(stored)
  if (stored !== shownStored) {
    setShownStored(stored)
    setChosen(null)
  }
  const [status, setStatus] = useState<string | null>(null)
  const value = chosen ?? stored

  const save = useMutation({
    mutationFn: (body: TimeBillingSettingsRequest) =>
      api.put<TimeBillingSettings>(timeTrackingSettingsUrl(tenantId), body),
    onSuccess: (saved) => {
      queryClient.setQueryData(timeTrackingSettingsKey(tenantId), saved)
      // The worklist and every preview count the rounded minutes anew.
      void queryClient.invalidateQueries({ queryKey: timeBillingKey(tenantId) })
      setStatus(incrementSavedText(saved))
    },
    onError: () =>
      void queryClient.invalidateQueries({ queryKey: timeTrackingSettingsKey(tenantId) }),
  })

  const changed = value !== undefined && value !== stored
  const fieldError = fieldErrorsOf(save.error).billingIncrementMinutes

  return (
    <Panel
      title="Abrechnungstakt"
      description="Gerundet wird nur die Menge auf der Rechnung, die erfasste Zeit bleibt."
    >
      {settings.isPending ? (
        <LoadingBlock label="Abrechnungstakt wird geladen" />
      ) : settings.isError ? (
        <ErrorNotice error={settings.error} />
      ) : (
        <div className="grid gap-3">
          {save.error !== null && fieldError === undefined && <ErrorNotice error={save.error} />}
          <div className="flex flex-wrap items-end gap-3">
            <SelectField
              label="Abrechnungstakt"
              value={value === undefined ? '' : String(value)}
              onChange={(event) => {
                save.reset()
                setStatus(null)
                setChosen(Number(event.target.value))
              }}
              error={fieldError}
              tooltip="Jeder Eintrag wird einzeln auf den Takt aufgerundet: 7 Minuten bei 15 werden 15. Wer anders verrechnen will als gemessen, ändert die Menge im Entwurf."
              className="sm:w-column-xl"
            >
              {BILLING_INCREMENTS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {billingIncrementLabel(minutes)}
                </option>
              ))}
            </SelectField>
            <Button
              variant="secondary"
              onClick={() => {
                if (value !== undefined) save.mutate({ billingIncrementMinutes: value })
              }}
              busy={save.isPending}
              disabled={!changed}
            >
              Speichern
            </Button>
          </div>
          {settings.data.changedAt && (
            <p className="text-small text-text-tertiary">
              Geändert {formatDateTime(settings.data.changedAt)}
              {settings.data.changedBy ? ` von ${settings.data.changedBy}` : ''}
            </p>
          )}
          <p role="status" aria-live="polite" className="text-small text-text-secondary">
            {status !== null && (
              <span className="inline-flex items-center gap-1.5">
                <Check size={13} className="text-accent-text" aria-hidden />
                {status}
              </span>
            )}
          </p>
        </div>
      )}
    </Panel>
  )
}

function UserDefaults({ tenantId }: { tenantId: number }) {
  const queryClient = useQueryClient()
  const defaults = useQuery({
    queryKey: userDefaultsKey(tenantId),
    queryFn: () => api.get<TimeUserDefault[]>(userDefaultsUrl(tenantId)),
  })

  // Whose default the dialog sets; counted, so each opening starts empty.
  const [choosing, setChoosing] = useState<TimeUserDefault | null>(null)
  const [openings, setOpenings] = useState(0)
  // What the last change did, in one line under the table.
  const [status, setStatus] = useState<string | null>(null)

  const change = useMutation({
    mutationFn: ({ row, body }: { row: TimeUserDefault; body: TimeUserDefaultRequest }) =>
      api.put<TimeUserDefault>(userDefaultUrl(tenantId, row.userId), body),
    onSuccess: (saved) => {
      queryClient.setQueryData<TimeUserDefault[]>(userDefaultsKey(tenantId), (rows) =>
        rows?.map((row) => (row.userId === saved.userId ? saved : row)),
      )
      setStatus(
        saved.productId == null
          ? `Standardleistung von ${saved.userName} entfernt.`
          : `Standardleistung von ${saved.userName}: ${saved.serviceName ?? 'gespeichert'}.`,
      )
      setChoosing(null)
    },
    // Another administrator may have set it at the same moment: read the table anew.
    onError: () => void queryClient.invalidateQueries({ queryKey: userDefaultsKey(tenantId) }),
  })

  const open = (row: TimeUserDefault) => {
    change.reset()
    setStatus(null)
    setOpenings((count) => count + 1)
    setChoosing(row)
  }

  const remove = (row: TimeUserDefault) => {
    change.reset()
    setStatus(null)
    change.mutate({ row, body: { productId: null } })
  }

  const columns: Column<TimeUserDefault>[] = [
    {
      key: 'user',
      header: 'Benutzer',
      render: (row) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className={row.userActive ? 'font-medium' : 'text-text-secondary'}>
            {row.userName}
          </span>
          {!row.userActive && <Badge tone="muted">Deaktiviert</Badge>}
        </span>
      ),
    },
    {
      key: 'service',
      header: 'Standardleistung',
      render: (row) => <DefaultServiceText row={row} />,
    },
    {
      key: 'actions',
      header: '',
      width: 'w-column-xl',
      align: 'right',
      render: (row) => (
        <span className="inline-flex items-center gap-3">
          <button
            type="button"
            onClick={() => open(row)}
            className="text-small text-text-secondary transition-colors hover:text-text-primary"
            aria-label={`Standardleistung von ${row.userName} ${row.productId == null ? 'festlegen' : 'ändern'}`}
          >
            {row.productId == null ? 'Festlegen' : 'Ändern'}
          </button>
          {row.productId != null && (
            <button
              type="button"
              onClick={() => remove(row)}
              disabled={change.isPending}
              className="text-small text-text-tertiary transition-colors hover:text-danger disabled:cursor-not-allowed"
              aria-label={`Standardleistung von ${row.userName} entfernen`}
            >
              Entfernen
            </button>
          )}
        </span>
      ),
    },
  ]

  return (
    <>
      <div className="grid gap-4">
        {change.error !== null && choosing === null && <ErrorNotice error={change.error} />}

        <Panel
          title="Standardleistung je Benutzer"
          description="Die Leistung, die «Meine Zeiten» vorschlägt, solange jemand auf einem Projekt oder Kunden noch nichts erfasst hat. Ihr Preis ist der Satz dieser Person."
          padded={false}
        >
          <DataTable
            columns={columns}
            rows={defaults.data ?? []}
            keyOf={(row) => row.userId}
            loading={defaults.isPending}
            error={defaults.error}
            empty={
              <EmptyState
                title="Keine Benutzer"
                description="Dieser Mandant hat noch keinen Benutzer, dem eine Leistung vorgeschlagen werden könnte."
              />
            }
          />
        </Panel>

        <p role="status" aria-live="polite" className="text-small text-text-secondary">
          {status !== null && (
            <span className="inline-flex items-center gap-1.5">
              <Check size={13} className="text-accent-text" aria-hidden />
              {status}
            </span>
          )}
        </p>
      </div>

      <DefaultServiceDialog
        key={openings}
        tenantId={tenantId}
        row={choosing}
        busy={change.isPending}
        error={choosing === null ? null : change.error}
        onClose={() => {
          change.reset()
          setChoosing(null)
        }}
        onChoose={(row, service) => change.mutate({ row, body: { productId: service.productId } })}
      />
    </>
  )
}

/** The default of one user as the table shows it, with what has become of it since. */
function DefaultServiceText({ row }: { row: TimeUserDefault }) {
  const state = userDefaultState(row)
  if (state === 'NONE') return <span className="text-text-tertiary">Keine</span>
  if (state === 'GONE') {
    return <span className="text-text-secondary">Leistung nicht mehr vorhanden</span>
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      {row.productNumber && (
        <span className="font-mono text-small text-text-tertiary">{row.productNumber}</span>
      )}
      <span className={state === 'ACTIVE' ? '' : 'text-text-secondary'}>{row.serviceName}</span>
      {state === 'INACTIVE' && (
        <Badge tone="muted">Deaktiviert · wird nicht mehr vorgeschlagen</Badge>
      )}
    </span>
  )
}

/**
 * Picks the default service of one user from the active services. Taking a hit and saving sets
 * it; removing goes through «Entfernen» in the table.
 */
function DefaultServiceDialog({
  tenantId,
  row,
  busy,
  error,
  onClose,
  onChoose,
}: {
  tenantId: number
  /** Whose default is chosen; `null` while the dialog is shut. */
  row: TimeUserDefault | null
  busy: boolean
  /** What the last save threw, shown at the field where the backend names it. */
  error: unknown
  onClose: () => void
  onChoose: (row: TimeUserDefault, service: TimeServiceChoice) => void
}) {
  // Held while the box fades out, so its title does not go blank in front of the eyes.
  const [held, setHeld] = useState(row)
  if (row !== null && held !== row) setHeld(row)
  const [term, setTerm] = useState('')
  const [service, setService] = useState<TimeServiceChoice | null>(null)
  const [complaint, setComplaint] = useState<string | null>(null)
  const field = useRef<HTMLInputElement>(null)

  const submit = () => {
    if (held === null || busy) return
    if (service === null) {
      setComplaint('Eine Leistung aus der Liste wählen.')
      return
    }
    setComplaint(null)
    onChoose(held, service)
  }

  const fieldError = complaint ?? fieldErrorsOf(error).productId

  return (
    <Dialog
      open={row !== null}
      onClose={onClose}
      title={held === null ? 'Standardleistung' : `Standardleistung von ${held.userName}`}
      description="Nur eine aktive Leistung, ein Produkt vom Typ Leistung."
      dirty={term.trim() !== ''}
      onSubmit={submit}
      initialFocus={field}
      footer={
        <>
          <DialogCancelButton />
          <Button onClick={submit} busy={busy} shortcut>
            Speichern
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error !== null && !isToldByFields(error, ['productId']) && <ErrorNotice error={error} />}
        <ServiceLookup
          tenantId={tenantId}
          label="Standardleistung"
          term={term}
          onTerm={(next) => {
            setTerm(next)
            setService(null)
          }}
          chosen={service !== null}
          onChoose={(hit) => {
            setService(hit)
            setTerm(hit.name)
            setComplaint(null)
          }}
          error={fieldError}
          inputRef={field}
        />
      </div>
    </Dialog>
  )
}
