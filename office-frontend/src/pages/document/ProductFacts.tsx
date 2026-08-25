import { formatAmount, formatQuantity } from '../../lib/format'
import { availabilityAt, availabilityHint, reservedForText } from '../../lib/inventory'
import type { Product, ProductAvailability, VatCategory } from '../../lib/types'
import { priceOriginText, useResolvedPrice } from './productInfo'
import { useAvailability } from './stockInfo'

/** One figure of the box, with the line under it and whether it is a warning. */
type Fact = { label: string; value: string; hint?: string; warn?: boolean }

/**
 * What is known about the chosen product, next to the fields that are typed in.
 *
 * <p>Read-only on purpose, the price included: which price a customer pays follows from the
 * customer price, the price group and the base price, and that resolution belongs to the
 * backend. Shown here so nobody has to leave the document to see it.
 *
 * <p>What cannot be read is left out rather than shown as a zero — a price of 0.00 next to a
 * product is a statement, and a wrong one. That something could not be read is said out loud
 * instead, because a line that silently disappears is indistinguishable from one that never
 * applied.
 *
 * <p>The free quantity stands here rather than one screen away in the inventory: the most
 * expensive mistake a classic ERP makes is that a seller has to open another module to learn
 * whether they can deliver. It is <b>one</b> figure — stock less what is spoken for — because
 * three figures side by side make every reader do the subtraction; the other two stand in the
 * line underneath.
 *
 * <p>Mounted for as long as the dialog is, product or not: the block is announced through a
 * live region, and a region that is inserted together with its text is not a change a screen
 * reader reads out.
 */
export function ProductFacts({
  tenantId,
  partnerId,
  product,
  quantity,
  perUnitOnly = false,
  currency,
  vatOf,
  vatFailed = false,
  stockLocationId,
}: {
  tenantId: number
  /** The customer of the document, whose price list decides. */
  partnerId: number
  /** The chosen product, undefined while none is. */
  product?: Product
  /** How much is sold, because a price can start at a quantity. */
  quantity: number
  /** True where `quantity` stands in for one the price resolution cannot answer for. */
  perUnitOnly?: boolean
  /** The currency the price list is kept in, left out where the document does not say. */
  currency?: string
  vatOf: (category: VatCategory | undefined) => string | undefined
  /** True where the VAT rates of the day could not be read at all. */
  vatFailed?: boolean
  /**
   * The store the document delivers from, as the server worked it out. Undefined where the
   * document moves no stock or the tenant keeps one store — then the whole-tenant figure is
   * the same number anyway (ADR-0067 of the backend).
   */
  stockLocationId?: number
}) {
  const resolved = useResolvedPrice(tenantId, partnerId, product?.id, quantity)
  const price = resolved.data
  const stock = useAvailability(tenantId, product?.id)
  // Narrowed to the store this document books at. Asking the whole tenant would report a
  // quantity that lies somewhere the Lieferschein never touches.
  const free = availabilityAt(stock.data, stockLocationId)

  const facts: Fact[] = []
  if (product !== undefined) {
    facts.push({ label: 'Einheit', value: product.unitLabel ?? product.unit })
    if (product.revenueAccount) {
      facts.push({
        label: 'Ertragskonto',
        value: product.revenueAccount,
        hint: product.revenueAccountLabel,
      })
    }
    const vat = vatOf(product.vatCategory)
    if (vat !== undefined) {
      facts.push({
        label: 'MwSt',
        value: vat,
        hint: vatFailed ? 'Satz konnte nicht gelesen werden.' : undefined,
      })
    }
    if (price !== undefined) {
      facts.push({
        // Named, not just "Preis": the figure is per unit although the resolution was asked
        // for the whole quantity, and next to the quantity field "Preis" reads as the amount
        // of the line.
        label: 'Einzelpreis',
        value: `${formatAmount(price.price)}${currency ? ` ${currency}` : ''}`,
        hint: [
          priceOriginText(price.origin),
          price.includesVat ? 'inkl. MwSt' : 'exkl. MwSt',
          perUnitOnly ? 'für eine Einheit' : undefined,
        ]
          .filter((entry) => entry !== undefined)
          .join(', '),
      })
    }
    const availableFact = availabilityFact(free, product, quantity)
    if (availableFact !== undefined) facts.push(availableFact)
  }

  return (
    <>
      <p aria-live="polite" className="sr-only">
        {spokenFacts(product, facts)}
      </p>

      {product !== undefined && (
        <div className="rounded-[var(--radius-md)] bg-sunken px-3.5 py-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-5">
            {facts.map((fact) => (
              <div key={fact.label} className="min-w-0">
                <dt className="text-[11px] text-text-tertiary">{fact.label}</dt>
                <dd
                  className={`truncate text-[13px] ${
                    fact.warn ? 'text-warning' : 'text-text-primary'
                  }`}
                  title={fact.hint}
                >
                  {fact.value}
                </dd>
                {fact.hint && (
                  <dd className="truncate text-[11px] text-text-secondary">{fact.hint}</dd>
                )}
              </div>
            ))}
          </dl>

          {resolved.isError && (
            <p className="mt-2.5 text-[11px] text-text-secondary">
              Der Preis konnte nicht gelesen werden.
            </p>
          )}
          {/* Said out loud rather than shown as a 0: a zero next to a product means «sold
              out», and claiming that because a request failed is worse than saying nothing. */}
          {stock.isError && (
            <p className="mt-2.5 text-[11px] text-text-secondary">
              Die Verfügbarkeit konnte nicht gelesen werden.
            </p>
          )}
        </div>
      )}
    </>
  )
}

/**
 * The «Verfügbar» figure, or nothing at all.
 *
 * <p>Nothing at all in three cases, and they are not the same: the figures are still on their
 * way, the right to read the inventory is missing, or nobody keeps a stock of this product. All
 * three leave the fact out — and none of them shows a 0, which would read as «sold out».
 *
 * @param availability what is free of the product, undefined while it is unknown
 * @param product the chosen product, for its unit
 * @param quantity what the dialog is about to sell
 * @returns the fact, or undefined where there is no figure to show
 */
function availabilityFact(
  availability: ProductAvailability | undefined,
  product: Product,
  quantity: number,
): Fact | undefined {
  if (availability === undefined || !availability.stockManaged) return undefined
  const free = availability.availableQuantity ?? 0
  const short = quantity > free
  const unit = product.unitLabel ?? product.unit
  return {
    label: 'Verfügbar',
    value: `${formatQuantity(free)}${unit ? ` ${unit}` : ''}`,
    warn: short,
    hint: short
      ? [
          `${formatQuantity(quantity)} gebraucht`,
          availabilityHint(availability),
          reservedForText(availability.heldBy),
        ]
          .filter((entry) => entry !== '')
          .join(' · ')
      : availabilityHint(availability),
  }
}

/**
 * What a screen reader hears when a product was taken over.
 *
 * <p>The keyboard puts the focus into the quantity right after the hit is taken, so unit,
 * revenue account, VAT, price and what is free appear above a field nobody is on. Without this
 * they are never read out at all.
 *
 * @param product the chosen product, undefined while none is
 * @param facts what is shown next to it
 * @returns the sentence to announce, empty while nothing is chosen
 */
function spokenFacts(
  product: Product | undefined,
  facts: readonly { label: string; value: string }[],
): string {
  if (product === undefined) return ''
  return [product.name, ...facts.map((fact) => `${fact.label} ${fact.value}`)].join(', ')
}
