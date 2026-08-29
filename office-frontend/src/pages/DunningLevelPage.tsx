import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { DataTable, type Column } from '../components/DataTable'
import { Dialog } from '../components/Dialog'
import { EmptyState, ErrorNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { SelectField } from '../components/SelectField'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import {
  DUNNING_RIGHTS,
  activeLevelCount,
  addDunningLevel,
  deleteDunningLevel,
  dunningLevelsKey,
  dunningSettingsKey,
  escalationProblem,
  fetchDunningLevels,
  isHighestLevel,
  setDunningLevelActive,
  updateDunningLevel,
  type DunningLevelBody,
} from '../lib/dunning'
import { formatAmount } from '../lib/format'
import { useMasterDataList } from '../masterdata/useMasterData'
import type { DunningLevel } from '../lib/types'

/** What the level dialog edits. Strings, because a half-typed number is not a number. */
type LevelForm = {
  dunningTypeId: string
  daysAfterDue: string
  paymentDays: string
  minDaysSincePrevious: string
  feeAmount: string
}

const EMPTY_FORM: LevelForm = {
  dunningTypeId: '',
  daysAfterDue: '',
  paymentDays: '10',
  minDaysSincePrevious: '10',
  feeAmount: '0.00',
}

/**
 * The dunning levels of the tenant: when each one falls due, how long it grants, what it costs.
 *
 * <p>A level is always **appended on top** and removed from the top: inserting one in the
 * middle would renumber every reminder already issued above it (backend ADR-0093).
 */
export function DunningLevelPage() {
  return (
    <RequireTenant permission={DUNNING_RIGHTS.read}>
      {(tenantId) => <Levels tenantId={tenantId} />}
    </RequireTenant>
  )
}

function Levels({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayConfigure = can(DUNNING_RIGHTS.configure)

  const [editing, setEditing] = useState<DunningLevel | null>(null)
  const [creating, setCreating] = useState(false)
  const [removing, setRemoving] = useState<DunningLevel | null>(null)
  const [form, setForm] = useState<LevelForm>(EMPTY_FORM)

  const levels = useQuery({
    queryKey: dunningLevelsKey(tenantId),
    queryFn: () => fetchDunningLevels(tenantId),
  })

  // The catalogue carries the name of a level. Only the values that may still be chosen:
  // a new level must not be named by something the tenant deactivated.
  const types = useMasterDataList(tenantId, 'dunning-types')

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: dunningLevelsKey(tenantId) })
    void queryClient.invalidateQueries({ queryKey: dunningSettingsKey(tenantId) })
  }

  const closeForm = () => {
    setCreating(false)
    setEditing(null)
  }

  const save = useMutation({
    mutationFn: (body: DunningLevelBody) =>
      editing === null
        ? addDunningLevel(tenantId, body)
        : updateDunningLevel(tenantId, editing.id, body),
    onSuccess: () => {
      refresh()
      closeForm()
    },
  })

  const toggle = useMutation({
    mutationFn: (level: DunningLevel) =>
      setDunningLevelActive(tenantId, level.id, !level.active),
    onSuccess: refresh,
  })

  const remove = useMutation({
    mutationFn: (level: DunningLevel) => deleteDunningLevel(tenantId, level.id),
    onSuccess: () => {
      refresh()
      setRemoving(null)
    },
  })

  const rows = levels.data ?? []
  const problem = escalationProblem(rows)

  const openNew = () => {
    save.reset()
    setForm({ ...EMPTY_FORM, dunningTypeId: String(types.data?.[0]?.id ?? '') })
    setCreating(true)
  }

  const openEdit = (level: DunningLevel) => {
    if (!mayConfigure) return
    save.reset()
    setForm({
      dunningTypeId: String(level.dunningTypeId),
      daysAfterDue: String(level.daysAfterDue),
      paymentDays: String(level.paymentDays),
      minDaysSincePrevious: String(level.minDaysSincePrevious),
      feeAmount: level.feeAmount.toFixed(2),
    })
    setEditing(level)
  }

  const submit = () =>
    save.mutate({
      dunningTypeId: Number(form.dunningTypeId),
      daysAfterDue: Number(form.daysAfterDue),
      paymentDays: Number(form.paymentDays),
      minDaysSincePrevious: Number(form.minDaysSincePrevious),
      feeAmount: Number(form.feeAmount.replace(',', '.')),
    })

  const incomplete =
    form.dunningTypeId === '' || form.daysAfterDue === '' || form.paymentDays === ''

  const columns: Column<DunningLevel>[] = [
    {
      key: 'level',
      header: 'Stufe',
      width: 'w-[80px]',
      render: (level) => <span className="font-mono text-[12px]">{level.levelNo}</span>,
    },
    {
      key: 'name',
      header: 'Bezeichnung',
      render: (level) => level.dunningTypeName ?? `Mahnart ${level.dunningTypeId}`,
    },
    {
      key: 'due',
      header: 'Nach Fälligkeit',
      align: 'right',
      width: 'w-[140px]',
      render: (level) => `${level.daysAfterDue} Tage`,
    },
    {
      key: 'payment',
      header: 'Zahlfrist',
      align: 'right',
      width: 'w-[110px]',
      render: (level) => `${level.paymentDays} Tage`,
    },
    {
      key: 'block',
      header: 'Sperrfrist',
      align: 'right',
      width: 'w-[110px]',
      render: (level) =>
        level.minDaysSincePrevious === 0 ? '–' : `${level.minDaysSincePrevious} Tage`,
    },
    {
      key: 'fee',
      header: 'Gebühr',
      align: 'right',
      width: 'w-[110px]',
      render: (level) =>
        level.feeAmount === 0 ? (
          <span className="text-text-tertiary">–</span>
        ) : (
          formatAmount(level.feeAmount)
        ),
    },
    {
      key: 'state',
      header: 'Status',
      width: 'w-[110px]',
      render: (level) =>
        level.active ? (
          <Badge tone="success">Aktiv</Badge>
        ) : (
          <Badge tone="muted">Abgeschaltet</Badge>
        ),
    },
  ]

  // The two actions sit in a column of their own rather than in a row menu: they are the
  // whole point of the screen, and a level that may not go is more useful disabled with a
  // reason than hidden.
  if (mayConfigure) {
    columns.push({
      key: 'actions',
      header: '',
      align: 'right',
      width: 'w-[220px]',
      render: (level) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              toggle.reset()
              toggle.mutate(level)
            }}
            disabled={toggle.isPending || (level.active && !isHighestLevel(rows, level))}
          >
            {level.active ? 'Abschalten' : 'Einschalten'}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              remove.reset()
              setRemoving(level)
            }}
            disabled={!isHighestLevel(rows, level)}
          >
            Löschen
          </Button>
        </div>
      ),
    })
  }

  return (
    <>
      <PageHeader
        title="Mahnstufen"
        subtitle={`${activeLevelCount(rows)} von ${rows.length} Stufen aktiv`}
      >
        {mayConfigure && (
          <Button onClick={openNew} disabled={types.data === undefined}>
            <Plus size={15} aria-hidden />
            Stufe
          </Button>
        )}
      </PageHeader>

      <div className="px-8 pb-12">
        {problem !== null && (
          <div className="mb-6">
            <ErrorNotice
              error={new Error(
                `${problem} Eine Mahnung, die milder ausfällt als die vorige, ist keine Eskalation.`,
              )}
            />
          </div>
        )}
        {toggle.error !== null && (
          <div className="mb-6">
            <ErrorNotice error={toggle.error} />
          </div>
        )}
        {remove.error !== null && (
          <div className="mb-6">
            <ErrorNotice error={remove.error} />
          </div>
        )}

        <Panel padded={false}>
          <DataTable
            columns={columns}
            rows={rows}
            keyOf={(level) => level.id}
            onRowOpen={mayConfigure ? openEdit : undefined}
            loading={levels.isPending}
            error={levels.error}
            empty={
              <EmptyState
                title="Keine Mahnstufen"
                description="Die vier ausgelieferten Stufen entstehen beim ersten Öffnen der Einstellungen."
              />
            }
          />
        </Panel>

        <p className="mt-4 text-[12px] text-text-secondary">
          Eine Stufe wird immer oben angehängt und nur von oben entfernt — sonst entstünde die
          Folge 1, 3, 4. Abschalten behält die Stufe für bereits ausgestellte Mahnungen.
        </p>
      </div>

      <Dialog
        open={creating || editing !== null}
        onClose={closeForm}
        title={editing === null ? 'Mahnstufe hinzufügen' : `Stufe ${editing.levelNo} bearbeiten`}
        description={
          editing === null
            ? 'Die neue Stufe wird oben angehängt. Fristen und Gebühr dürfen gegenüber der Stufe darunter nicht milder werden.'
            : 'Die Position ändert sich nicht.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={closeForm}>
              Abbrechen
            </Button>
            <Button onClick={submit} busy={save.isPending} disabled={incomplete}>
              {editing === null ? 'Hinzufügen' : 'Übernehmen'}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <SelectField
            label="Bezeichnung"
            value={form.dunningTypeId}
            onChange={(event) => setForm({ ...form, dunningTypeId: event.target.value })}
            hint="Aus der Liste «Mahnarten». Der gedruckte Titel je Sprache steht bei den Mahntexten."
          >
            {(types.data ?? []).map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </SelectField>

          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              label="Nach Fälligkeit"
              value={form.daysAfterDue}
              onChange={(event) => setForm({ ...form, daysAfterDue: event.target.value })}
              inputMode="numeric"
              numeric
              hint="Tage"
            />
            <TextField
              label="Zahlfrist"
              value={form.paymentDays}
              onChange={(event) => setForm({ ...form, paymentDays: event.target.value })}
              inputMode="numeric"
              numeric
              hint="Tage"
            />
            <TextField
              label="Sperrfrist"
              value={form.minDaysSincePrevious}
              onChange={(event) =>
                setForm({ ...form, minDaysSincePrevious: event.target.value })
              }
              inputMode="numeric"
              numeric
              hint="Tage seit der vorigen Mahnung"
            />
          </div>

          <TextField
            label="Mahngebühr"
            value={form.feeAmount}
            onChange={(event) => setForm({ ...form, feeAmount: event.target.value })}
            inputMode="decimal"
            numeric
          />

          {Number(form.feeAmount.replace(',', '.')) > 0 && (
            <p className="text-[12px] text-text-secondary">
              Eine Mahngebühr ist nur geschuldet, wenn sie vertraglich vereinbart ist — im
              Vertrag, in der Offerte oder in einbezogenen AGB. Ob sie mehrwertsteuerpflichtig
              ist, klärt Ihr Treuhänder. Sie wirkt erst, wenn die Gebührenlogik ausgeliefert
              ist.
            </p>
          )}

          {save.error !== null && <ErrorNotice error={save.error} />}
        </div>
      </Dialog>

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Mahnstufe löschen"
        description="Endgültig. Eine Stufe, auf der schon gemahnt wurde, wird abgeschaltet statt gelöscht — dann bleibt sie für die ausgestellten Mahnungen stehen."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => removing !== null && remove.mutate(removing)}
              busy={remove.isPending}
            >
              Löschen
            </Button>
          </>
        }
      >
        <p className="text-[13px]">
          Stufe {removing?.levelNo} «{removing?.dunningTypeName}» wird entfernt. Die aktive
          Stufenzahl sinkt damit auf {Math.max(activeLevelCount(rows) - 1, 0)}.
        </p>
      </Dialog>
    </>
  )
}
