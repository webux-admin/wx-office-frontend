import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { api } from '../../lib/api'
import type { PriceGroup } from '../../lib/types'
import { emptyPriceRow, type PriceRowForm } from './priceRows'

/** The columns of the table, in the order they are drawn. */
const HEADERS = ['Preisgruppe', 'Ab Menge', 'Gültig ab', 'Gültig bis', 'Preis']

/**
 * The prices of one product, editable in place.
 *
 * <p>One table for all of them: a line naming a price group is that group's price, a line
 * without one is the base price everything falls back to. Every line may start at a quantity
 * and may be limited to a stretch of time, which is what makes a price increase per 1 January
 * or a two week campaign expressible at all.
 *
 * <p>The lines live in the mask and are stored with it, in one request that replaces the whole
 * list. Row by row would not work: raising a price means ending the old line and adding the
 * new one, and only a request carrying both can be checked for overlapping periods.
 */
export function ProductPrices({
  tenantId,
  rows,
  onChange,
  mayWrite,
}: {
  tenantId: number
  rows: PriceRowForm[]
  onChange: (rows: PriceRowForm[]) => void
  mayWrite: boolean
}) {
  const groups = useQuery({
    queryKey: ['price-groups', tenantId],
    queryFn: () => api.get<PriceGroup[]>(`/api/tenants/${tenantId}/price-groups`),
  })

  const set = (key: string, field: keyof PriceRowForm, value: string) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, [field]: value } : row)))

  const remove = (key: string) => onChange(rows.filter((row) => row.key !== key))

  const nameOf = (row: PriceRowForm) => {
    if (row.priceGroup === '') return 'Grundpreis'
    const group = groups.data?.find((entry) => entry.id === Number(row.priceGroup))
    return group ? `${group.code} · ${group.name}` : `Gruppe ${row.priceGroup}`
  }

  return (
    <Panel
      title="Preise"
      description="Kundenpreis vor Preisgruppe vor Grundpreis. Innerhalb einer Stufe gilt die höchste erreichte Menge, und nur, was am Leistungsdatum gültig ist."
      padded={false}
      action={
        mayWrite ? (
          <Button type="button" variant="ghost" onClick={() => onChange([...rows, emptyPriceRow()])}>
            <Plus size={14} aria-hidden />
            Zeile hinzufügen
          </Button>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState
            title="Keine Preise"
            description={
              mayWrite
                ? 'Ohne Preiszeile kostet dieses Produkt nichts. Der Grundpreis ist eine Zeile ohne Preisgruppe.'
                : 'Für dieses Produkt ist kein Preis hinterlegt.'
            }
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line-subtle">
                {HEADERS.map((header, index) => (
                  <th
                    key={header}
                    scope="col"
                    className={`px-3 py-2 text-[11px] font-medium uppercase tracking-[0.4px] text-text-tertiary ${
                      index === 0 ? 'pl-5 text-left' : 'text-right'
                    }`}
                  >
                    {header}
                  </th>
                ))}
                <th scope="col" className="w-[56px] pr-5">
                  <span className="sr-only">Zeile entfernen</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-line-subtle last:border-b-0">
                  <Cell className="pl-5">
                    <GridSelect
                      label={`Preisgruppe der Zeile ${nameOf(row)}`}
                      value={row.priceGroup}
                      onChange={(value) => set(row.key, 'priceGroup', value)}
                      disabled={!mayWrite || groups.isPending}
                    >
                      <option value="">Grundpreis</option>
                      {(groups.data ?? []).map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.code} · {group.name}
                        </option>
                      ))}
                    </GridSelect>
                  </Cell>

                  <Cell>
                    <GridInput
                      label={`Ab Menge der Zeile ${nameOf(row)}`}
                      value={row.minQuantity}
                      onChange={(value) => set(row.key, 'minQuantity', value)}
                      disabled={!mayWrite}
                      inputMode="decimal"
                      numeric
                      placeholder="ab 1"
                    />
                  </Cell>

                  <Cell>
                    <GridInput
                      label={`Gültig ab der Zeile ${nameOf(row)}`}
                      value={row.validFrom}
                      onChange={(value) => set(row.key, 'validFrom', value)}
                      disabled={!mayWrite}
                      type="date"
                    />
                  </Cell>

                  <Cell>
                    <GridInput
                      label={`Gültig bis der Zeile ${nameOf(row)}`}
                      value={row.validTo}
                      onChange={(value) => set(row.key, 'validTo', value)}
                      disabled={!mayWrite}
                      type="date"
                    />
                  </Cell>

                  <Cell>
                    <GridInput
                      label={`Preis der Zeile ${nameOf(row)}`}
                      value={row.price}
                      onChange={(value) => set(row.key, 'price', value)}
                      disabled={!mayWrite}
                      inputMode="decimal"
                      numeric
                    />
                  </Cell>

                  <td className="pr-5 text-right align-middle">
                    {mayWrite && (
                      <button
                        type="button"
                        onClick={() => remove(row.key)}
                        aria-label={`Preiszeile ${nameOf(row)} entfernen`}
                        className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-text-tertiary transition-colors hover:bg-danger/12 hover:text-danger"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="border-t border-line-subtle px-5 py-3 text-[12px] text-text-secondary">
        Leer heisst offen: ohne Ab-Datum gilt der Preis seit jeher, ohne Bis-Datum bis auf
        weiteres. Zwei Zeilen derselben Gruppe und Menge dürfen sich nicht überschneiden.
      </p>
    </Panel>
  )
}

function Cell({ className = '', children }: { className?: string; children: ReactNode }) {
  return <td className={`px-1.5 py-1.5 align-middle ${className}`}>{children}</td>
}

/**
 * A bare input for one cell of the grid.
 *
 * <p>Without the frame of `TextField`: a label above every cell would repeat the column
 * heading on every line. The heading names the column for the eye, `aria-label` names the
 * cell for a screen reader, which is the pairing a data grid needs.
 */
function GridInput({
  label,
  value,
  onChange,
  disabled,
  numeric = false,
  ...rest
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  numeric?: boolean
  type?: string
  inputMode?: 'decimal'
  placeholder?: string
}) {
  return (
    <input
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={`h-9 w-full rounded-[var(--radius-sm)] border border-transparent bg-transparent px-2 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-tertiary hover:border-line focus:border-accent disabled:text-text-secondary ${
        numeric ? 'text-right font-mono tabular-nums' : ''
      }`}
      {...rest}
    />
  )
}

function GridSelect({
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full rounded-[var(--radius-sm)] border border-transparent bg-surface px-2 text-[13px] text-text-primary outline-none transition-colors hover:border-line focus:border-accent disabled:text-text-secondary"
    >
      {children}
    </select>
  )
}
