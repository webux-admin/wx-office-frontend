import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '../../components/Button'
import { CheckboxField } from '../../components/CheckboxField'
import { DataTable, type Column } from '../../components/DataTable'
import { Dialog } from '../../components/Dialog'
import { EmptyState, ErrorNotice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { SelectField } from '../../components/SelectField'
import { TextField } from '../../components/TextField'
import { api } from '../../lib/api'
import { listQuery, PICKER_SIZE } from '../../lib/paging'
import { formatAmount, formatPercent, formatQuantity, parseDecimal } from '../../lib/format'
import { shortLabelForCode } from '../../lib/masterData'
import type { DocumentLine, Page, Product, SalesDocument, VatCategory } from '../../lib/types'
import { CatalogueSelect } from '../../masterdata/CatalogueSelect'
import { MasterDataSelect } from '../../masterdata/MasterDataSelect'
import { useMasterDataEntries } from '../../masterdata/useMasterData'

/** What a line looks like when it comes from the catalogue. */
export type ProductLine = {
  productId: number
  quantity: number
  discountPercent?: number
  serviceDateFrom?: string
  serviceDateTo?: string
}

/** What a line looks like when it is written by hand. */
export type FreeLine = {
  description: string
  quantity: number
  unit: string
  unitPrice: number
  discountPercent?: number
  vatCategory: VatCategory
  priceIncludesVat: boolean
  serviceDateFrom?: string
  serviceDateTo?: string
}

/**
 * The positions of an order.
 *
 * <p>Prices and totals are never computed here. A line is sent to the backend, and what comes
 * back is what is shown. The amount on a document is a legal statement, and there must be
 * exactly one place that decides it.
 */
export function OrderLines({
  tenantId,
  order,
  editable,
  onAddProductLine,
  onAddFreeLine,
  onRemoveLine,
  busy,
  error,
}: {
  tenantId: number
  order: SalesDocument
  /** False once the order is issued: nothing may change about a document that is out. */
  editable: boolean
  onAddProductLine: (line: ProductLine) => void
  onAddFreeLine: (line: FreeLine) => void
  onRemoveLine: (lineNumber: number) => void
  busy: boolean
  error: unknown
}) {
  const [adding, setAdding] = useState<'product' | 'free' | null>(null)
  const units = useMasterDataEntries(tenantId, 'units')

  // A picker wants every entry, not a page, so it asks for the largest page the server
  // allows. Beyond that a dropdown is the wrong control anyway and this needs a type-ahead.
  const productQuery = listQuery({ activeOnly: true, size: PICKER_SIZE })
  const products = useQuery({
    queryKey: ['products', tenantId, productQuery],
    queryFn: () => api.get<Page<Product>>(`/api/tenants/${tenantId}/products?${productQuery}`),
    enabled: editable,
  })

  const columns: Column<DocumentLine>[] = [
    {
      key: 'position',
      header: 'Pos',
      width: 'w-[60px]',
      render: (line) => (
        <span className="font-mono text-[12px] text-text-tertiary">{line.lineNumber}</span>
      ),
    },
    {
      key: 'description',
      header: 'Bezeichnung',
      render: (line) => (
        <span>
          <span className="block">{line.description}</span>
          {line.productNumber && (
            <span className="block font-mono text-[11px] text-text-tertiary">
              {line.productNumber}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'quantity',
      header: 'Menge',
      align: 'right',
      width: 'w-[110px]',
      render: (line) => (
        <span>
          {formatQuantity(line.quantity)}{' '}
          <span className="text-text-tertiary">{shortLabelForCode(units, line.unit)}</span>
        </span>
      ),
    },
    {
      key: 'unitPrice',
      header: 'Einzelpreis',
      align: 'right',
      width: 'w-[120px]',
      render: (line) => formatAmount(line.unitPrice),
    },
    {
      key: 'discount',
      header: 'Rabatt',
      align: 'right',
      width: 'w-[90px]',
      render: (line) => (line.discountPercent ? formatPercent(line.discountPercent) : '-'),
    },
    {
      key: 'vat',
      header: 'MwSt',
      align: 'right',
      width: 'w-[90px]',
      render: (line) => (line.vatRate === undefined ? '-' : formatPercent(line.vatRate)),
    },
    {
      key: 'net',
      header: 'Netto',
      align: 'right',
      width: 'w-[120px]',
      render: (line) => formatAmount(line.lineNet),
    },
  ]

  if (editable) {
    columns.push({
      key: 'remove',
      header: '',
      width: 'w-[60px]',
      render: (line) => (
        <button
          type="button"
          onClick={() => onRemoveLine(line.lineNumber)}
          aria-label={`Position ${line.lineNumber} entfernen`}
          className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-text-tertiary transition-colors hover:bg-danger/12 hover:text-danger"
        >
          <Trash2 size={14} />
        </button>
      ),
    })
  }

  return (
    <>
      <Panel
        title="Positionen"
        padded={false}
        action={
          editable ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setAdding('product')}>
                <Plus size={15} aria-hidden />
                Aus Katalog
              </Button>
              <Button variant="secondary" onClick={() => setAdding('free')}>
                <Plus size={15} aria-hidden />
                Freie Zeile
              </Button>
            </div>
          ) : undefined
        }
      >
        <DataTable
          columns={columns}
          rows={order.lines ?? []}
          keyOf={(line) => line.lineNumber}
          empty={
            <EmptyState
              title="Noch keine Position"
              description={
                editable
                  ? 'Ein Auftrag ohne Position lässt sich nicht ausstellen.'
                  : 'Dieser Beleg wurde ohne Positionen ausgestellt.'
              }
            />
          }
          footer={
            (order.lines?.length ?? 0) > 0 ? (
              <>
                <tr>
                  <td colSpan={columns.length - 1} className="px-5 py-1.5 pt-3 text-right text-text-secondary">
                    Netto
                  </td>
                  <td className="px-5 py-1.5 pt-3 text-right font-mono tabular-nums">
                    {formatAmount(order.totalNet)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={columns.length - 1} className="px-5 py-1.5 text-right text-text-secondary">
                    MwSt
                  </td>
                  <td className="px-5 py-1.5 text-right font-mono tabular-nums">
                    {formatAmount(order.totalVat)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={columns.length - 1} className="px-5 pb-3 py-1.5 text-right font-medium">
                    Total {order.currency}
                  </td>
                  <td className="px-5 pb-3 py-1.5 text-right font-mono font-medium tabular-nums">
                    {formatAmount(order.totalGross)}
                  </td>
                </tr>
              </>
            ) : undefined
          }
        />

        {error !== null && error !== undefined && (
          <div className="px-5 pb-4">
            <ErrorNotice error={error} />
          </div>
        )}
      </Panel>

      <ProductLineDialog
        open={adding === 'product'}
        onClose={() => setAdding(null)}
        onSubmit={(line) => {
          onAddProductLine(line)
          setAdding(null)
        }}
        products={products.data?.content ?? []}
        busy={busy}
      />

      <FreeLineDialog
        tenantId={tenantId}
        open={adding === 'free'}
        onClose={() => setAdding(null)}
        onSubmit={(line) => {
          onAddFreeLine(line)
          setAdding(null)
        }}
        busy={busy}
      />
    </>
  )
}

/**
 * Adds a line from the catalogue.
 *
 * <p>No price is asked for: which one applies to this customer is decided by the backend from
 * the customer price, the price group and the base price, in that order.
 */
function ProductLineDialog({
  open,
  onClose,
  onSubmit,
  products,
  busy,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (line: ProductLine) => void
  products: Product[]
  busy: boolean
}) {
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [discount, setDiscount] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const amount = parseDecimal(quantity)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Position aus dem Katalog"
      description="Der Preis kommt aus der Preisfindung des Backends."
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            busy={busy}
            disabled={productId === '' || amount === null}
            onClick={() =>
              onSubmit({
                productId: Number(productId),
                quantity: amount ?? 1,
                discountPercent: parseDecimal(discount) ?? undefined,
                serviceDateFrom: from || undefined,
                serviceDateTo: to || undefined,
              })
            }
          >
            Hinzufügen
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Produkt"
          value={productId}
          onChange={(event) => setProductId(event.target.value)}
          className="sm:col-span-2"
        >
          <option value="">Bitte wählen</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.productNumber ? `${product.productNumber} · ` : ''}
              {product.name}
            </option>
          ))}
        </SelectField>

        <TextField
          label="Menge"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          inputMode="decimal"
          numeric
        />
        <TextField
          label="Rabatt in Prozent"
          value={discount}
          onChange={(event) => setDiscount(event.target.value)}
          inputMode="decimal"
          numeric
        />
        <TextField
          label="Leistung von"
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          hint="Bestimmt den MwSt-Satz."
        />
        <TextField
          label="Leistung bis"
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
      </div>
    </Dialog>
  )
}

/** Adds a line that is not in the catalogue, price and VAT treatment included. */
function FreeLineDialog({
  tenantId,
  open,
  onClose,
  onSubmit,
  busy,
}: {
  tenantId: number
  open: boolean
  onClose: () => void
  onSubmit: (line: FreeLine) => void
  busy: boolean
}) {
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('1')
  // Empty, not a code: the dropdown fills it with what this tenant marked as its default.
  const [unit, setUnit] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [discount, setDiscount] = useState('')
  const [vatCategory, setVatCategory] = useState<VatCategory>('STANDARD')
  const [priceIncludesVat, setPriceIncludesVat] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const count = parseDecimal(quantity)
  const price = parseDecimal(unitPrice)
  const incomplete = description.trim() === '' || count === null || price === null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Freie Position"
      description="Für alles, was nicht im Katalog steht."
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            busy={busy}
            disabled={incomplete}
            onClick={() =>
              onSubmit({
                description: description.trim(),
                quantity: count ?? 1,
                unit,
                unitPrice: price ?? 0,
                discountPercent: parseDecimal(discount) ?? undefined,
                vatCategory,
                priceIncludesVat,
                serviceDateFrom: from || undefined,
                serviceDateTo: to || undefined,
              })
            }
          >
            Hinzufügen
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Bezeichnung"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={500}
          className="sm:col-span-2"
        />
        <TextField
          label="Menge"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          inputMode="decimal"
          numeric
        />
        <MasterDataSelect
          label="Einheit"
          tenantId={tenantId}
          list="units"
          value={unit}
          onChange={setUnit}
        />
        <TextField
          label="Einzelpreis"
          value={unitPrice}
          onChange={(event) => setUnitPrice(event.target.value)}
          inputMode="decimal"
          numeric
        />
        <TextField
          label="Rabatt in Prozent"
          value={discount}
          onChange={(event) => setDiscount(event.target.value)}
          inputMode="decimal"
          numeric
        />
        <CatalogueSelect
          label="MwSt-Behandlung"
          tenantId={tenantId}
          catalogue="vat-category"
          value={vatCategory}
          onChange={(code) => setVatCategory(code as VatCategory)}
          className="sm:col-span-2"
        />
        <TextField
          label="Leistung von"
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          hint="Bestimmt den MwSt-Satz."
        />
        <TextField
          label="Leistung bis"
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
      </div>

      <CheckboxField
        label="Preis versteht sich inklusive MwSt"
        checked={priceIncludesVat}
        onChange={(event) => setPriceIncludesVat(event.target.checked)}
        className="mt-5"
      />
    </Dialog>
  )
}
