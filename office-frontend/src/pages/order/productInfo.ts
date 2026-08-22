/**
 * What the position dialog says about a chosen product.
 *
 * <p>None of it is worked out here. The VAT rate comes from the rates of the day of supply,
 * the price from the price resolution of the backend — this file only decides what to show
 * when one of the two has nothing to say.
 */
import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { api } from '../../lib/api'
import { formatPercent } from '../../lib/format'
import type { PriceOrigin, Product, ResolvedPrice, VatCategory, VatRates } from '../../lib/types'
import { useCatalogueLabel } from '../../masterdata/useMasterData'

/**
 * The VAT treatments that carry no rate.
 *
 * <p>They are two and not one on purpose: goods exempt with credit (MWSTG Art. 23) are
 * invoiced at 0 % and the tax is shown, goods exempt without credit (Art. 21) carry no tax
 * statement at all. The backend answers zero for both — a figure that says neither of the
 * two apart, and does not say them apart from a real rate of zero either.
 */
const WITHOUT_A_RATE: readonly VatCategory[] = ['EXEMPT_WITH_CREDIT', 'EXEMPT_WITHOUT_CREDIT']

/** What the origins of a resolved price are called in the mask. */
const PRICE_ORIGINS: Record<string, string> = {
  PARTNER: 'Kundenpreis',
  PRICE_GROUP: 'Preisgruppe',
  DEFAULT_PRICE_GROUP: 'Standard-Preisgruppe',
  BASE: 'Grundpreis',
}

/**
 * The VAT rate of a product on the day of supply, or the treatment it falls under.
 *
 * <p>A rate that does not apply on that day is not shown as a number: a document line
 * delivered before a rate change carries the old rate, and a figure taken from the wrong day
 * is worse than no figure. The name of the treatment is then the honest answer, and it is
 * the only answer for the two treatments that carry no rate at all.
 *
 * @param rates the rates of the day of supply, undefined while they are on their way
 * @param category the VAT treatment of the product, undefined where it carries none
 * @param labelOf what this tenant calls a treatment
 * @returns the rate as a percentage, the name of the treatment, or undefined
 */
export function vatText(
  rates: VatRates | undefined,
  category: VatCategory | undefined,
  labelOf: (code: string | undefined) => string,
): string | undefined {
  if (category === undefined) return undefined
  // A treatment that carries no rate is named, never numbered. The rate endpoint answers
  // zero for those two as well, and "0 %" would hide which of them a product falls under.
  if (WITHOUT_A_RATE.includes(category)) return labelOf(category)
  const rate = rates?.[category]
  if (rate !== undefined) return formatPercent(rate)
  // Not a rate but the treatment: `labelForCode` answers with the bare code where the
  // catalogue of this tenant is still on its way.
  return labelOf(category)
}

/**
 * What a hit of the quick search says about itself besides its name: unit, revenue account
 * and VAT rate, in that order.
 *
 * @param product the product as the search returned it
 * @param vat what {@link vatText} made of its VAT treatment
 * @returns the entries to show, empty where the product says nothing about itself
 */
export function productMeta(product: Product, vat: string | undefined): string[] {
  return [product.unitLabel ?? product.unit, product.revenueAccount, vat].filter(
    (entry): entry is string => entry !== undefined && entry !== '',
  )
}

/**
 * Names the rule that decided a resolved price.
 *
 * @param origin the rule, as the backend named it
 * @returns what it is called in the mask
 */
export function priceOriginText(origin: PriceOrigin): string {
  return PRICE_ORIGINS[origin] ?? 'Preis'
}

/**
 * The VAT rates of one day, as a function that labels a treatment.
 *
 * <p>Reports separately whether the rates could be read at all. Without that the mask cannot
 * tell "no rate on that day" from "the whole answer failed", and both look like the bare name
 * of the treatment.
 *
 * @param tenantId the tenant whose rates are meant
 * @param dateOfSupply the day that decides, as `yyyy-MM-dd`
 * @returns the function turning a VAT treatment into what to show for it, and whether the
 *          rates were refused
 */
export function useVatText(
  tenantId: number,
  dateOfSupply: string,
): {
  vatOf: (category: VatCategory | undefined) => string | undefined
  vatFailed: boolean
} {
  const labelOf = useCatalogueLabel(tenantId, 'vat-category')
  const rates = useQuery({
    queryKey: ['vat-rates', tenantId, dateOfSupply],
    queryFn: () =>
      api.get<VatRates>(
        `/api/tenants/${tenantId}/vat-rates${dateOfSupply ? `?dateOfSupply=${dateOfSupply}` : ''}`,
      ),
    // The endpoint answers for all categories at once and refuses the lot as soon as one of
    // them has no rate on that day. That refusal is the same on every attempt, so trying it
    // three times only delays the notice.
    retry: false,
  })

  const vatOf = useCallback(
    (category: VatCategory | undefined) => vatText(rates.data, category, labelOf),
    [rates.data, labelOf],
  )
  return { vatOf, vatFailed: rates.isError }
}

/**
 * What this customer pays for this product, as the backend resolves it.
 *
 * <p>Read for display only. Which price ends up on the line is decided again when the line is
 * sent, by the same resolution — the mask never sends a price of its own.
 *
 * @param tenantId the tenant
 * @param partnerId the customer of the document
 * @param productId the chosen product, undefined while none is
 * @param quantity how much is sold, because a price can start at a quantity
 * @returns the query; without data while it is on its way, and after a refusal
 */
export function useResolvedPrice(
  tenantId: number,
  partnerId: number,
  productId: number | undefined,
  quantity: number,
) {
  return useQuery({
    queryKey: ['resolved-price', tenantId, partnerId, productId, quantity],
    queryFn: () =>
      // No date is sent: the resolution asks what a customer pays today, and a price does not
      // yet have a period it applies in. Once prices carry one, this call gains the date of
      // supply -- the same day that already decides the VAT rate just above.
      api.get<ResolvedPrice>(
        `/api/tenants/${tenantId}/partners/${partnerId}/prices/${productId}` +
          `?quantity=${quantity}`,
      ),
    enabled: productId !== undefined,
    // A price the tenant may not read, or one the resolution has nothing for, is left out of
    // the dialog rather than retried: it is an aside, not what the mask is here for.
    retry: false,
  })
}
