import { useRef, useState, type KeyboardEvent } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { Button } from '../components/Button'
import { CheckboxField } from '../components/CheckboxField'
import { DataTable, type Column } from '../components/DataTable'
import { Dialog } from '../components/Dialog'
import { EmptyState, ErrorNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { QuickSearchField } from '../components/QuickSearch'
import { SelectField } from '../components/SelectField'
import { TextField } from '../components/TextField'
import { useQuickSearch } from '../components/useQuickSearch'
import { useSubmitShortcut } from '../components/useSubmitShortcut'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { formatAmount, formatDate } from '../lib/format'
import { emptyPage, listQuery, PAGE_SIZE } from '../lib/paging'
import { onlyBarCodeMatched } from '../lib/productSearch'
import type { Page, Partner, PriceEntryResult, PriceEntryRow, PriceGroup } from '../lib/types'
import { PartnerQuickSearch } from './document/PartnerQuickSearch'
import { partnerLabel } from './document/partnerSearch'
import { priceOriginText } from './document/productInfo'
import {
  changeCountText,
  dayBefore,
  editedCount,
  fieldValue,
  firstComplaint,
  nextRow,
  payloadRows,
  periodText,
  savedText,
  withEdit,
  withoutEdit,
  type PriceEdits,
} from './priceentry/priceEntry'

/**
 * Pricing a whole catalogue for one price group or one customer.
 *
 * <p>The product mask prices one product at a time, which is the wrong way round for the
 * everyday case: «from 1 January the group Handel pays these prices». Here the catalogue
 * stands as a column of fields, one per product, and the keyboard walks down it.
 *
 * <p>Only the target's own row without a quantity scale is written. Base prices, other groups
 * and scales are left exactly as they are — a screen showing one field per product has no
 * business throwing away an agreement it never showed (ADR-0059).
 */
export function PriceEntryPage() {
  return (
    <RequireTenant permission="PRODUCT_READ">
      {(tenantId) => <PriceEntry tenantId={tenantId} />}
    </RequireTenant>
  )
}

/** Whose prices are being typed. */
type TargetKind = 'group' | 'partner'

function PriceEntry({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayWrite = can('PRODUCT_WRITE')

  const [targetKind, setTargetKind] = useState<TargetKind>('group')
  const [chosenGroup, setChosenGroup] = useState('')
  const [partner, setPartner] = useState<Partner | undefined>(undefined)
  const [partnerTerm, setPartnerTerm] = useState('')
  const [validFrom, setValidFrom] = useState('')
  const [validTo, setValidTo] = useState('')
  const [closeOpenEnded, setCloseOpenEnded] = useState(false)

  const search = useQuickSearch()
  const [activeOnly, setActiveOnly] = useState(true)
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('name,asc')

  // Kept across pages and search terms on purpose: somebody prices the cables, then the
  // pipes, then saves once. Every change carries what stood in its field, so the save knows
  // what really changed even for a row that is long off screen.
  const [edits, setEdits] = useState<PriceEdits>({})
  const [complaint, setComplaint] = useState<string | null>(null)
  const [result, setResult] = useState<PriceEntryResult | null>(null)
  // A change to the target or the period would give every typed price a different meaning,
  // so it is asked about rather than done. Held as a thunk, run once the question is answered.
  const [pending, setPending] = useState<{ run: () => void } | null>(null)
  const fields = useRef(new Map<number, HTMLInputElement>())

  const groups = useQuery({
    queryKey: ['price-groups', tenantId],
    queryFn: () => api.get<PriceGroup[]>(`/api/tenants/${tenantId}/price-groups`),
  })

  // Until one is picked the default group is priced: that is the group most tenants have,
  // and an empty target would leave the screen with nothing to show at all.
  const groupId =
    chosenGroup !== ''
      ? chosenGroup
      : (groups.data?.find((group) => group.isDefault)?.id?.toString() ?? '')
  const targetChosen = targetKind === 'group' ? groupId !== '' : partner !== undefined

  // The day the effective prices are read for. The first day of the new period, not today:
  // what matters while pricing is what applies when the new prices start.
  const on = validFrom === '' ? undefined : validFrom
  const query = listQuery({
    priceGroupId: targetKind === 'group' ? groupId : undefined,
    partnerId: targetKind === 'partner' ? partner?.id : undefined,
    on,
    search: search.term,
    activeOnly,
    page,
    size: PAGE_SIZE,
    sort,
  })
  const rows = useQuery({
    queryKey: ['price-entry', tenantId, query],
    queryFn: () => api.get<Page<PriceEntryRow>>(`/api/tenants/${tenantId}/price-entry?${query}`),
    enabled: targetChosen,
    // The rows found last stay on screen while the next answer is on its way, so the table
    // does not flicker between two pages of a price round.
    placeholderData: keepPreviousData,
  })

  const pageOfRows = rows.data ?? emptyPage<PriceEntryRow>()
  const shown = pageOfRows.content
  const changes = editedCount(edits)
  // Which row a field sits in, for the arrow keys. Built once per render rather than
  // searched for in every cell.
  const indexOf = new Map(shown.map((row, index) => [row.productId, index]))

  const save = useMutation({
    mutationFn: () =>
      api.put<PriceEntryResult>(`/api/tenants/${tenantId}/price-entry`, {
        priceGroupId: targetKind === 'group' ? Number(groupId) : undefined,
        partnerId: targetKind === 'partner' ? partner?.id : undefined,
        validFrom: validFrom === '' ? undefined : validFrom,
        validTo: validTo === '' ? undefined : validTo,
        closeOpenEnded,
        rows: payloadRows(edits),
      }),
    onSuccess: (answer) => {
      setResult(answer)
      setEdits({})
      // The prices just written are what the fields have to show now, and the effective
      // price of every row may have moved with them.
      void queryClient.invalidateQueries({ queryKey: ['price-entry', tenantId] })
    },
  })

  const submit = () => {
    setResult(null)
    const found = firstComplaint(edits, validFrom, validTo, targetChosen)
    setComplaint(found)
    if (found !== null) return
    if (changes === 0) return
    save.mutate()
  }

  // Ctrl+S and Ctrl+Enter save, so a price round runs without reaching for the mouse.
  useSubmitShortcut(mayWrite && !save.isPending && changes > 0 ? submit : undefined)

  /**
   * Runs a change that would give the typed prices another meaning — but asks first while
   * something is typed and not yet saved.
   */
  const guard = (run: () => void) => {
    if (changes === 0) {
      run()
      return
    }
    setPending({ run })
  }

  const changeTargetKind = (kind: TargetKind) =>
    guard(() => {
      setTargetKind(kind)
      setEdits({})
      setPage(0)
      setResult(null)
    })

  const changeTarget = (run: () => void) =>
    guard(() => {
      run()
      setEdits({})
      setPage(0)
      setResult(null)
    })

  /** Moves the cursor down or up the column, and takes a field back with Escape. */
  const onFieldKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number, id: number) => {
    if (event.key === 'Escape') {
      setEdits(withoutEdit(edits, id))
      return
    }
    const target = nextRow(event.key, index, shown.length)
    if (target === null) {
      // Enter in the last row saves rather than doing nothing, which is what a form does.
      if (event.key === 'Enter' && mayWrite && changes > 0) {
        event.preventDefault()
        submit()
      }
      return
    }
    event.preventDefault()
    fields.current.get(shown[target].productId)?.focus()
  }

  const columns: Column<PriceEntryRow>[] = [
    {
      key: 'number',
      header: 'Nummer',
      sortKey: 'productNumber',
      width: 'w-[110px]',
      render: (row) => (
        <span className="font-mono text-[12px] text-text-tertiary">{row.productNumber ?? '-'}</span>
      ),
    },
    {
      key: 'name',
      header: 'Bezeichnung',
      sortKey: 'name',
      render: (row) => (
        <span className="inline-flex flex-col items-start">
          <span className="font-medium">{row.name}</span>
          {/* The code under the name, and only where it is the whole reason the row is here:
              this table has no column for it, so a scanned article would otherwise stand
              among the others without a single field that says why. The product list answers
              the same search the same way. */}
          {onlyBarCodeMatched(row, search.term) && (
            <span className="font-mono text-[11px] text-text-tertiary">{row.eanCode}</span>
          )}
        </span>
      ),
    },
    {
      key: 'unit',
      header: 'Einheit',
      width: 'w-[110px]',
      render: (row) => <span className="text-text-secondary">{row.unitLabel ?? '-'}</span>,
    },
    {
      key: 'effective',
      header: 'Gültig',
      align: 'right',
      width: 'w-[160px]',
      // Not sortable: the server can sort by the base price of a product, and that is not
      // what stands here. A control that sorts by another number than the one in the column
      // is worse than no control.
      render: (row) => (
        <span className="inline-flex flex-col items-end">
          <span className="tabular-nums">{formatAmount(row.effectivePrice)}</span>
          {row.origin !== undefined && (
            <span className="text-[11px] text-text-tertiary">{priceOriginText(row.origin)}</span>
          )}
        </span>
      ),
    },
    {
      key: 'own',
      header: 'Eigener Preis',
      align: 'right',
      width: 'w-[180px]',
      render: (row) => {
        const index = indexOf.get(row.productId) ?? 0
        const period = periodText(row)
        return (
          <span className="inline-flex flex-col items-end gap-0.5">
            <input
              ref={(element) => {
                if (element === null) fields.current.delete(row.productId)
                else fields.current.set(row.productId, element)
              }}
              value={fieldValue(row, edits)}
              onChange={(event) => setEdits(withEdit(edits, row, event.target.value))}
              onKeyDown={(event) => onFieldKeyDown(event, index, row.productId)}
              // Whatever stands there is replaced by what is typed next: the field is for
              // one number, and correcting a price by first deleting it is a keystroke
              // nobody should have to spend fifty times in a row.
              onFocus={(event) => event.currentTarget.select()}
              // A click sets the caret after the focus ran, which would undo that selection.
              onMouseUp={(event) => event.preventDefault()}
              disabled={!mayWrite}
              inputMode="decimal"
              aria-label={`Preis für ${row.name}`}
              // A field that was typed in is marked: after fifty rows nobody remembers which
              // ones they touched, and the count alone does not say where they are.
              className={`w-[110px] rounded-[var(--radius-sm)] border px-2 py-1 text-right text-[13px] tabular-nums outline-none transition-colors focus:border-accent disabled:opacity-60 ${
                edits[row.productId] === undefined
                  ? 'border-line bg-surface'
                  : 'border-accent-text bg-highlight'
              }`}
            />
            {period !== '' && <span className="text-[11px] text-text-tertiary">{period}</span>}
          </span>
        )
      },
    },
  ]

  return (
    <>
      <PageHeader
        title="Schnellerfassung"
        subtitle="Preise einer Preisgruppe oder eines Kunden über den ganzen Katalog erfassen."
      >
        {changes > 0 && (
          <span className="text-[13px] text-text-secondary" aria-live="polite">
            {changeCountText(changes)}
          </span>
        )}
        {mayWrite && (
          <Button onClick={submit} busy={save.isPending} disabled={changes === 0} shortcut>
            Speichern
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-4 px-8 pb-12">
        {(complaint !== null || save.error !== null) && (
          <ErrorNotice error={save.error ?? new Error(complaint ?? '')} />
        )}
        {result !== null && (
          <p
            className="flex items-center gap-2 rounded-[var(--radius-md)] border border-line bg-surface px-4 py-3 text-[13px] text-text-secondary"
            aria-live="polite"
          >
            <Check size={15} className="text-accent-text" aria-hidden />
            {savedText(result)}
          </p>
        )}

        <Panel
          title="Ziel und Zeitraum"
          description="Für wen die Preise gelten und ab wann. Beides gilt für die ganze Erfassung."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SelectField
              label="Ziel"
              value={targetKind}
              onChange={(event) => changeTargetKind(event.target.value as TargetKind)}
            >
              <option value="group">Preisgruppe</option>
              <option value="partner">Einzelner Kunde</option>
            </SelectField>

            {targetKind === 'group' ? (
              <SelectField
                label="Preisgruppe"
                value={groupId}
                onChange={(event) => {
                  const next = event.target.value
                  changeTarget(() => setChosenGroup(next))
                }}
                hint={groups.data?.length === 0 ? 'Es ist noch keine Preisgruppe erfasst.' : undefined}
              >
                {groups.data?.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                    {group.isDefault === true ? ' (Standard)' : ''}
                  </option>
                ))}
              </SelectField>
            ) : (
              <PartnerQuickSearch
                tenantId={tenantId}
                term={partnerTerm}
                onTerm={(term) => {
                  // Typing over a customer that was taken over means «another one»: the
                  // target falls away, but what was typed stays until a new one is picked
                  // — nothing is lost yet, so nothing is asked yet.
                  setPartnerTerm(term)
                  setPartner(undefined)
                }}
                chosen={partner !== undefined}
                onChoose={(chosen) =>
                  changeTarget(() => {
                    setPartner(chosen)
                    setPartnerTerm(partnerLabel(chosen))
                  })
                }
              />
            )}

            <TextField
              label="Gültig ab"
              type="date"
              value={validFrom}
              onChange={(event) => {
                const next = event.target.value
                guard(() => {
                  setValidFrom(next)
                  setEdits({})
                  setResult(null)
                })
              }}
              hint="Leer heisst: gilt ab sofort."
            />
            <TextField
              label="Gültig bis"
              type="date"
              value={validTo}
              onChange={(event) => {
                const next = event.target.value
                guard(() => {
                  setValidTo(next)
                  setEdits({})
                  setResult(null)
                })
              }}
              hint="Für Aktionspreise. Leer heisst: ohne Ende."
            />
          </div>

          <div className="mt-4">
            <CheckboxField
              label="Laufende Preise am Vortag beenden"
              checked={closeOpenEnded}
              onChange={(event) => setCloseOpenEnded(event.target.checked)}
              disabled={validFrom === ''}
              hint={
                validFrom === ''
                  ? 'Braucht ein Ab-Datum: ohne dieses gibt es keinen Vortag.'
                  : `Ein Preis ohne Enddatum würde sich mit dem neuen überschneiden und den Speichervorgang abweisen. Mit Haken endet er am ${formatDate(dayBefore(validFrom))}.`
              }
            />
          </div>
        </Panel>

        <Panel padded={false} title="Produkte">
          <div className="flex flex-wrap items-center gap-4 px-5 pb-4">
            <QuickSearchField
              value={search.value}
              onChange={(next) => {
                search.setValue(next)
                setPage(0)
              }}
              placeholder="Nummer, Bezeichnung oder Strichcode"
            />
            <CheckboxField
              label="Nur aktive"
              checked={activeOnly}
              onChange={(event) => {
                setActiveOnly(event.target.checked)
                setPage(0)
              }}
            />
            <span className="text-[12px] text-text-tertiary">
              Erfasste Preise bleiben beim Blättern und Suchen erhalten und werden gemeinsam
              gespeichert.
            </span>
          </div>

          {!targetChosen ? (
            <EmptyState
              title="Kein Ziel gewählt"
              description="Wählen Sie eine Preisgruppe oder einen Kunden, dann steht hier der Katalog."
            />
          ) : (
            <DataTable
              columns={columns}
              rows={shown}
              keyOf={(row) => row.productId}
              loading={rows.isPending}
              error={rows.error}
              empty={
                <EmptyState
                  title="Kein Produkt gefunden"
                  description="Andere Suche, oder den Haken bei «Nur aktive» entfernen."
                />
              }
              page={pageOfRows}
              onPageChange={setPage}
              sort={sort}
              onSortChange={(next) => {
                setSort(next)
                setPage(0)
              }}
            />
          )}
        </Panel>
      </div>

      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Erfasste Preise verwerfen?"
        description={`${changeCountText(changes)}, aber noch nicht gespeichert. Ziel und Zeitraum gelten für die ganze Erfassung — wer sie jetzt ändert, verliert das Erfasste.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>
              Zurück
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                pending?.run()
                setPending(null)
              }}
            >
              Verwerfen und ändern
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-text-secondary">
          Zuerst speichern behält alles: die Erfassung läuft danach mit dem neuen Ziel weiter.
        </p>
      </Dialog>
    </>
  )
}
