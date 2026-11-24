import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { DataTable, type Column } from '../components/DataTable'
import { Dialog } from '../components/Dialog'
import { DialogCancelButton } from '../components/DialogCancelButton'
import { EmptyState, ErrorNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { fieldErrorsOf, isToldByFields } from '../lib/fieldErrors'
import {
  TIMETRACKING_MODULE,
  TIMETRACKING_RIGHTS,
  userDefaultState,
  userDefaultUrl,
  userDefaultsKey,
  userDefaultsUrl,
} from '../lib/timetracking'
import type { TimeServiceChoice, TimeUserDefault, TimeUserDefaultRequest } from '../lib/types'
import { ServiceLookup } from '../timetracking/AssignmentFields'

/**
 * «Zeiterfassung» under the module settings: the default service of every user.
 *
 * <p>The default service is what the quick line suggests on a project or customer where the
 * user has taken nothing yet. «Beratung Senior» for one person and «Beratung Junior» for another
 * gives each their own rate through the price of the service, without a third place for prices
 * (backend ADR-0162). The billing interval follows on this page with #127.
 *
 * <p>With `TIME_WRITE`: the table names every user of the tenant, and keeping the defaults is
 * part of keeping the times of others.
 */
export function TimeTrackingSettingsPage() {
  return (
    <RequireTenant permission={TIMETRACKING_RIGHTS.write} module={TIMETRACKING_MODULE}>
      {(tenantId) => <UserDefaults tenantId={tenantId} />}
    </RequireTenant>
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
      <PageHeader
        title="Zeiterfassung"
        subtitle="Was für die Zeiten aller Benutzer gilt. Der Abrechnungstakt folgt mit dem Abrechnen."
      />

      <div className="grid gap-4 px-8 pb-12">
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
