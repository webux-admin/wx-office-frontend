import { parseDecimal } from '../../lib/format'
import type {
  FreeFieldType,
  Product,
  ProductFreeFieldValue,
  ProductType,
  VatCategory,
} from '../../lib/types'

/**
 * The little a payload needs to know about a free field: which place, and of what kind.
 *
 * <p>Both a stored value and a definition answer that, so the same function serves the mask
 * of a new article and of one that is already stored.
 */
export type FreeFieldSlot = { code: string; type?: FreeFieldType }

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
  /**
   * The free fields as the mask holds them: by place, and as text, because that is what an
   * input carries. What each place means is not kept here — it comes with the product.
   */
  freeFields: Record<string, string>
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
  freeFields: {},
}

/**
 * An empty mask for a new article.
 *
 * @returns the empty mask, active and discountable
 */
export function emptyProduct(): ProductForm {
  return { ...EMPTY, freeFields: {} }
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
    freeFields: toFreeFieldForm(product.freeFields),
  }
}

/**
 * Turns the free fields of a product into what the inputs hold.
 *
 * <p>A tick becomes `'true'` or `''`, a number its digits, an empty field an empty string —
 * one shape for all three, so the mask can keep them in one record.
 *
 * @param values the free fields as the API returned them
 * @returns the values by place, empty when the tenant defined none
 */
export function toFreeFieldForm(values: ProductFreeFieldValue[] | undefined): Record<string, string> {
  const form: Record<string, string> = {}
  for (const value of values ?? []) {
    form[value.code] =
      value.type === 'FLAG'
        ? value.flag === true
          ? 'true'
          : ''
        : value.type === 'NUMBER'
          ? (value.number?.toString() ?? '')
          : (value.text ?? '')
  }
  return form
}

/**
 * Turns what the inputs hold back into the payload of the free fields.
 *
 * <p>Only places the product already knows are sent: the definitions travel with the product,
 * and a place the tenant has not defined is refused by the backend anyway.
 *
 * <p>An emptied field is sent as an empty value rather than left out, because leaving it out
 * would keep the stored one — clearing a field has to reach the record.
 *
 * @param form the filled in mask
 * @param defined the free fields this tenant defined, by place and kind
 * @returns the values as the API wants them, or undefined when there are no free fields
 */
export function toFreeFieldPayload(
  form: ProductForm,
  defined: FreeFieldSlot[] | undefined,
): ProductFreeFieldValue[] | undefined {
  if (defined === undefined || defined.length === 0) return undefined
  return defined.map((field) => {
    const held = form.freeFields[field.code] ?? ''
    if (field.type === 'FLAG') return { code: field.code, flag: held === 'true' }
    if (field.type === 'NUMBER') return { code: field.code, number: parseDecimal(held) }
    return { code: field.code, text: held.trim() === '' ? null : held.trim() }
  })
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
 * <p>The prices are not part of it either: they have an endpoint of their own, so a master
 * data payload cannot silently drop one that is already stored. That includes the base price,
 * which is a price row like any other since it can be limited to a period.
 *
 * @param form the filled in mask
 * @returns the product as the API wants it
 */
export function toPayload(form: ProductForm, defined?: FreeFieldSlot[]): Partial<Product> {
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
    freeFields: toFreeFieldPayload(form, defined),
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
