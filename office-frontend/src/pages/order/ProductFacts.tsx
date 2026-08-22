import { formatAmount } from '../../lib/format'
import type { Product, VatCategory } from '../../lib/types'
import { priceOriginText, useResolvedPrice } from './productInfo'

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
}) {
  const resolved = useResolvedPrice(tenantId, partnerId, product?.id, quantity)
  const price = resolved.data

  const facts: { label: string; value: string; hint?: string }[] = []
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
  }

  return (
    <>
      <p aria-live="polite" className="sr-only">
        {spokenFacts(product, facts)}
      </p>

      {product !== undefined && (
        <div className="rounded-[var(--radius-md)] bg-sunken px-3.5 py-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
            {facts.map((fact) => (
              <div key={fact.label} className="min-w-0">
                <dt className="text-[11px] text-text-tertiary">{fact.label}</dt>
                <dd className="truncate text-[13px] text-text-primary" title={fact.hint}>
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
        </div>
      )}
    </>
  )
}

/**
 * What a screen reader hears when a product was taken over.
 *
 * <p>The keyboard puts the focus into the quantity right after the hit is taken, so unit,
 * revenue account, VAT and price appear above a field nobody is on. Without this they are
 * never read out at all.
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
