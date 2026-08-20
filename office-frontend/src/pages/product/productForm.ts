import { parseDecimal } from '../../lib/format'
import type { Product, ProductType, VatCategory } from '../../lib/types'

/**
 * The product mask while it is being filled in.
 *
 * <p>Every field is a string or a flag, because that is what an input holds. Turning them
 * into the types the API expects happens once, on the way out, rather than on every
 * keystroke.
 */
export type ProductForm = {
  productNumber: string
  productType: ProductType
  name: string
  subtitle: string
  internalComment: string
  description: string
  unit: string
  eanCode: string
  discountable: boolean
  active: boolean
  revenueAccount: string
  vatCategory: VatCategory
  basePrice: string
}

const EMPTY: ProductForm = {
  productNumber: '',
  productType: 'GOODS',
  name: '',
  subtitle: '',
  internalComment: '',
  description: '',
  // Empty, not a code: the dropdown fills it with what this tenant marked as its default.
  unit: '',
  eanCode: '',
  discountable: true,
  active: true,
  revenueAccount: '',
  vatCategory: 'STANDARD',
  basePrice: '',
}

/**
 * An empty mask for a new article.
 *
 * @returns the empty mask, active and discountable
 */
export function emptyProduct(): ProductForm {
  return { ...EMPTY }
}

/**
 * Fills the mask from a stored product.
 *
 * @param product the product as the API returned it
 * @returns the mask, with every missing text as an empty string
 */
export function toForm(product: Product): ProductForm {
  return {
    productNumber: product.productNumber ?? '',
    productType: product.productType,
    name: product.name ?? '',
    subtitle: product.subtitle ?? '',
    internalComment: product.internalComment ?? '',
    description: product.description ?? '',
    unit: product.unit ?? '',
    eanCode: product.eanCode ?? '',
    discountable: product.discountable !== false,
    active: product.active !== false,
    revenueAccount: product.revenueAccount ?? '',
    vatCategory: product.vatCategory ?? 'STANDARD',
    basePrice: product.basePrice?.toString() ?? '',
  }
}

/**
 * Turns the mask into the payload of `POST`/`PUT /api/tenants/{id}/products`.
 *
 * <p>An empty text is left out rather than sent as an empty string. That holds for the
 * article number as well, and there it has a consequence worth knowing: an emptied number is
 * absent from the payload, so the update keeps the stored one. The number can be replaced
 * but not removed — which is what the mask says at the field.
 *
 * <p>Whether the product is still offered is **not** part of it. That flag has its own
 * endpoint and its own right, so a master data payload cannot change it on the side.
 *
 * <p>Group prices are not part of it either: they have endpoints of their own, so a payload
 * cannot silently drop one that is already stored.
 *
 * @param form the filled in mask
 * @returns the product as the API wants it
 */
export function toPayload(form: ProductForm): Partial<Product> {
  return {
    productNumber: blankToUndefined(form.productNumber),
    productType: form.productType,
    name: form.name.trim(),
    subtitle: blankToUndefined(form.subtitle),
    description: blankToUndefined(form.description),
    internalComment: blankToUndefined(form.internalComment),
    eanCode: blankToUndefined(form.eanCode),
    discountable: form.discountable,
    unit: form.unit,
    revenueAccount: blankToUndefined(form.revenueAccount),
    vatCategory: form.vatCategory,
    basePrice: parseDecimal(form.basePrice) ?? undefined,
  }
}

/**
 * Checks what can be checked here, which is little.
 *
 * <p>The rules of the domain (whether the EAN check digit adds up, whether a number is still
 * free) belong to the backend and are answered by it. This only catches what would come back
 * as an English sentence, so the mask can name the field in German instead.
 *
 * @param form the filled in mask
 * @returns the German complaint, or `null` when nothing is obviously missing
 */
export function firstComplaint(form: ProductForm): string | null {
  if (form.name.trim() === '') return 'Ohne Bezeichnung lässt sich nichts speichern.'
  if (form.unit === '') return 'Ein Produkt braucht eine Einheit.'
  return null
}

/**
 * Whether the mask wants the active flag changed on the stored record.
 *
 * <p>Its own request, because it has its own right. Asked only when it really differs, so a
 * normal save stays one call.
 *
 * @param form the filled in mask
 * @param product the stored product, or `null` while creating
 * @returns true when the flag has to be sent
 */
export function activeChanged(form: ProductForm, product: Product | null): boolean {
  return form.active !== (product?.active !== false)
}

function blankToUndefined(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}
