/**
 * Types of the backend DTOs.
 *
 * <p>Names and fields match the records in `ch.webux.office.*.web` one to one. The backend
 * omits null properties from its JSON, so anything the domain allows to be empty is optional
 * here as well.
 */

// --- master data -------------------------------------------------------------

/**
 * The selection lists a tenant maintains, by the path segment they are served under.
 *
 * <p>Their values are tenant data, not code: a legal form or a unit exists because somebody
 * entered it, so there is no union of allowed codes anywhere in this frontend.
 */
export type MasterDataList =
  | 'legal-forms'
  | 'salutations'
  | 'units'
  | 'languages'
  | 'countries'
  | 'currencies'
  | 'layout-templates'
  | 'revenue-accounts'
  | 'payment-methods'
  | 'dunning-types'
  | 'billing-types'

/** One value of a selection list, as `/api/tenants/{id}/{list}` returns it. */
export type MasterDataEntry = {
  id: number
  code: string
  name: string
  /** Translations by language code; the name applies where one is missing. */
  labels?: Record<string, string>
  shortName?: string
  description?: string
  sortOrder?: number
  isDefault?: boolean
  active?: boolean
  /** Delivered with the application: renamable and deactivatable, but not deletable. */
  system?: boolean
  /** Only on languages: whether documents may be issued in it. */
  documentLanguage?: boolean
}

/**
 * The structural enums, by the path segment they are served under.
 *
 * <p>These steer logic, so a tenant cannot add or remove a value — only rename, reorder and
 * hide one. That is why they come from a different endpoint than the selection lists.
 */
export type CatalogueName =
  | 'partner-type'
  | 'address-usage'
  | 'product-type'
  | 'vat-category'
  | 'price-origin'
  | 'vat-method'
  | 'reference-type'
  | 'document-category'
  | 'document-status'

/** One value of a structural enum, as `/api/tenants/{id}/catalogues` returns it. */
export type CatalogueEntry = {
  code: string
  name: string
  labels?: Record<string, string>
  shortName?: string
  sortOrder?: number
  /** False when the tenant has hidden the value; it stays valid on stored records. */
  visible?: boolean
}

/** Every catalogue at once, keyed by its name. */
export type Catalogues = Partial<Record<CatalogueName, CatalogueEntry[]>>

/** What the payment period is counted from. */
export type DueDateBasis = 'DOCUMENT_DATE' | 'END_OF_MONTH'

/**
 * One payment condition of the tenant, as `/api/tenants/{id}/payment-terms` returns it.
 *
 * <p>More than a number of days: a term carries its discount stages, which is why it has a
 * table of its own instead of sitting in the generic selection lists.
 */
export type PaymentTerm = {
  id: number
  code: string
  name: string
  /** Translations by language code; the name applies where one is missing. */
  labels?: Record<string, string>
  description?: string
  netDays: number
  dueDateBasis?: DueDateBasis
  /** Discount stages, the earliest deadline first. */
  discounts?: PaymentTermDiscount[]
  sortOrder?: number
  isDefault?: boolean
  active?: boolean
  /** Delivered with the application: renamable and deactivatable, but not deletable. */
  system?: boolean
}

/** One discount stage: paying within `days` allows `percent` to be deducted. */
export type PaymentTermDiscount = { days: number; percent: number }

/** What a payment term means for one document, computed by the backend. */
export type PaymentTermCalculation = {
  code?: string
  name?: string
  netDays?: number
  dueDate?: string
  stages?: PaymentTermStage[]
  /** The sentence for the document, as the backend words it. */
  text?: string
}

/** One calculated discount stage of a {@link PaymentTermCalculation}. */
export type PaymentTermStage = {
  days?: number
  percent?: number
  discountDate?: string
  discountAmount?: number
  amountAfterDiscount?: number
}

// --- paging ------------------------------------------------------------------

/**
 * One page of a long list, the shape every paged endpoint answers in.
 *
 * <p>`totalElements` is the point of it: a page of fifty rows says nothing about whether
 * there are fifty-one or five thousand, so counting in the browser was never possible.
 */
export type Page<T> = {
  content: T[]
  /** Zero based number of this page. */
  page: number
  size: number
  totalElements: number
  totalPages: number
  /** `field,direction` pairs separated by semicolons; empty when the server chose. */
  sort: string
}

// --- user --------------------------------------------------------------------

/** A tenant the session may work in, with enough to name it on screen. */
export type TenantAccess = {
  id: number
  code: string
  name: string
  /** Preselected after login. */
  isDefault: boolean
}

/** Answer of /api/auth/login, /me and the tenant switch. */
export type AuthenticatedUser = {
  userId: number
  username: string
  /** Tenant this session works in. Absent while a superuser has not picked one. */
  activeTenantId?: number | null
  superuser: boolean
  /** Tenants the user may switch to, named. Every tenant for a superuser. */
  tenants: TenantAccess[]
  /** Effective permissions in the active tenant. */
  permissions: string[]
}

export type User = {
  id: number
  username: string
  email: string
  displayName: string
  language?: string
  active: boolean
  superuser: boolean
  /** Set after too many failed sign in attempts; only an administrator clears it. */
  locked: boolean
  lastLoginAt?: string
}

/** What a user may do in one tenant: through roles, plus anything granted directly. */
export type UserAccess = {
  userId: number
  tenantId: number
  roleIds: number[]
  directPermissions: string[]
  effectivePermissions: string[]
}

export type Role = {
  id: number
  tenantId: number
  name: string
  description?: string
  /** False for the roles a tenant is created with; those may be changed but not removed. */
  deletable: boolean
  permissions: string[]
}

/** Permission codes per module, as `/api/tenants/{id}/roles/permissions` groups them. */
export type PermissionCatalogue = Record<string, string[]>

// --- tenant ------------------------------------------------------------------

export type VatMethod = 'EFFECTIVE' | 'SALDO'
export type ReferenceType = 'QRR' | 'SCOR' | 'NON'

/**
 * A tenant.
 *
 * <p>The fields pointing at a selection list come in threes: the id it is stored under, the
 * stable code, and the label to show. Sending the code back is enough — the backend resolves
 * it — and the label is read-only.
 */
export type Tenant = {
  id: number
  code: string
  active?: boolean
  name: string
  legalFormId?: number
  legalForm?: string
  legalFormLabel?: string
  uid?: string
  commercialRegisterName?: string
  vat?: TenantVat
  address: TenantAddress
  contact?: TenantContact
  bank?: TenantBank
  baseCurrencyId?: number
  baseCurrency?: string
  baseCurrencyLabel?: string
  fiscalYearStartMonth?: number
  defaultLanguageId?: number
  defaultLanguage?: string
  defaultLanguageLabel?: string
  defaultPaymentTermId?: number
  /** The payment term as its stable code; sending it back is enough. */
  defaultPaymentTerm?: string
  defaultPaymentTermLabel?: string
  cashRoundingEnabled?: boolean
  cashRoundingIncrement?: number
  defaultRevenueAccountId?: number
  defaultRevenueAccount?: string
  defaultRevenueAccountLabel?: string
  invoiceFooterText?: string
  createdAt?: string
  changedAt?: string
}

export type TenantVat = {
  vatLiable: boolean
  vatMethod?: VatMethod
  /** Only meaningful with the saldo method: the flat rate agreed with the tax office. */
  vatSaldoRate?: number
  vatLiableFrom?: string
}

export type TenantAddress = {
  street?: string
  buildingNumber?: string
  postalCode: string
  town: string
  countryId?: number
  country?: string
  countryLabel?: string
}

export type TenantContact = { email?: string; phone?: string; website?: string }

export type TenantBank = {
  iban?: string
  /** Separate account for QR-bills carrying a QR reference; not every bank issues one. */
  qrIban?: string
  bankName?: string
  referenceType?: ReferenceType
  /** Customer identification of the bank, six digits. Without it there is no QR reference. */
  qrCustomerId?: string
}

// --- partner -----------------------------------------------------------------

export type PartnerType = 'ORGANISATION' | 'PERSON'
export type AddressUsage = 'ORDER' | 'OFFER' | 'DELIVERY_NOTE' | 'INVOICE' | 'DUNNING'

export type Partner = {
  id: number
  partnerNumber?: string
  partnerType: PartnerType
  active?: boolean
  isCustomer?: boolean
  isSupplier?: boolean
  name: string
  legalFormId?: number
  legalForm?: string
  legalFormLabel?: string
  uid?: string
  commercialRegisterName?: string
  salutationId?: number
  salutation?: string
  salutationLabel?: string
  firstName?: string
  lastName?: string
  languageId?: number
  language?: string
  languageLabel?: string
  email?: string
  phone?: string
  website?: string
  notes?: string
  paymentTermId?: number
  /** The payment term as its stable code; sending it back is enough. */
  paymentTerm?: string
  paymentTermLabel?: string
  creditLimit?: number
  /** Reference this supplier expects on payments made to it. */
  creditorReference?: string
  addresses?: PartnerAddress[]
  contacts?: PartnerContact[]
}

export type PartnerAddress = {
  id?: number
  label?: string
  name: string
  addressLine?: string
  street?: string
  buildingNumber?: string
  postalCode: string
  town: string
  countryId?: number
  country?: string
  countryLabel?: string
  email?: string
  phone?: string
  useAsDefault?: boolean
  /** Kinds of document addressed here; empty falls back to the default address. */
  usages?: AddressUsage[]
}

export type PartnerContact = {
  id?: number
  salutationId?: number
  salutation?: string
  salutationLabel?: string
  firstName?: string
  lastName: string
  jobTitle?: string
  email?: string
  phone?: string
  mobile?: string
  languageId?: number
  language?: string
  languageLabel?: string
  isPrimary?: boolean
}

// --- product -----------------------------------------------------------------

export type ProductType = 'GOODS' | 'SERVICE'

export type VatCategory =
  | 'STANDARD'
  | 'REDUCED'
  | 'ACCOMMODATION'
  | 'EXEMPT_WITH_CREDIT'
  | 'EXEMPT_WITHOUT_CREDIT'

export type Product = {
  id: number
  productNumber?: string
  active?: boolean
  productType: ProductType
  name: string
  /** Second line under the name, printed on the document line as well. */
  subtitle?: string
  description?: string
  /** Note for the tenant's own staff. Never printed on a document. */
  internalComment?: string
  /** Bar code number as digits: GTIN-8, -12, -13 or -14. */
  eanCode?: string
  /** False when a document line with this product must not carry a discount. */
  discountable?: boolean
  unitId?: number
  unit: string
  unitLabel?: string
  revenueAccountId?: number
  revenueAccount?: string
  revenueAccountLabel?: string
  vatCategory?: VatCategory
  basePrice?: number
  groupPrices?: GroupPrice[]
  /**
   * The free fields this tenant defined, one entry each, filled in or not.
   *
   * <p>Absent when the tenant defined none. On write only `code` and the value are read.
   */
  freeFields?: ProductFreeFieldValue[]
}

/** What kind of value a free field of a product holds. */
export type FreeFieldType = 'TEXT' | 'NUMBER' | 'FLAG'

/**
 * The value a product carries in one of its free fields.
 *
 * <p>Exactly one of `text`, `number` and `flag` is filled; which one follows from `type`.
 * Caption and type are read-only and come from the definition.
 */
export type ProductFreeFieldValue = {
  /** The place, for example `NUMBER_2`. */
  code: string
  type?: FreeFieldType
  /** The caption this tenant gave the field. */
  label?: string
  text?: string | null
  number?: number | null
  flag?: boolean | null
}

/**
 * What one free field means for this tenant.
 *
 * <p>The application keeps fifteen places on every product; this says what they are for. A
 * place without a definition is not offered anywhere.
 */
export type ProductFreeFieldDefinition = {
  id?: number
  /** The place, fixed after creation. */
  code: string
  /** The key a designed form binds a column to, for example `freeNumber2`. */
  columnCode?: string
  type?: FreeFieldType
  /** Caption in the default language. */
  name?: string
  /** Hint shown under the field in the product mask. */
  description?: string
  /** Translations by ISO 639-1 code. */
  labels?: Record<string, string>
  sortOrder?: number
  /** Whether the field is shown in the product mask at all. */
  active?: boolean
  /** Whether the value may go onto a document. */
  printable?: boolean
}

export type GroupPrice = { priceGroupId: number; price: number }

export type PriceGroup = {
  id: number
  code: string
  name: string
  description?: string
  /** True when the prices of this group are gross, as they are in retail. */
  priceIncludesVat?: boolean
  isDefault?: boolean
  active?: boolean
}

/** A price agreed with one partner, valid from a minimum quantity upwards. */
export type PartnerPrice = {
  productId: number
  minQuantity?: number
  price: number
}

export type PriceOrigin = 'PARTNER' | 'PRICE_GROUP' | 'DEFAULT_PRICE_GROUP' | 'BASE'

/** What one partner pays for one product, and which rule decided that. */
export type ResolvedPrice = {
  productId: number
  partnerId: number
  price: number
  origin: PriceOrigin
  priceGroupId?: number
  includesVat: boolean
}

/** Percentage per VAT category, keyed by {@link VatCategory}. */
export type VatRates = Partial<Record<VatCategory, number>>

// --- document ----------------------------------------------------------------

export type DocumentCategory = 'OFFER' | 'ORDER' | 'DELIVERY_NOTE' | 'INVOICE' | 'CREDIT_NOTE'
export type DocumentStatus = 'DRAFT' | 'FINALISED' | 'CANCELLED'

export type DocumentType = {
  id: number
  code: string
  category: DocumentCategory
  name: string
  numberPrefix?: string
  addressUsage?: AddressUsage
  documentLayoutId?: number
  documentLayout?: string
  /** What that form is called, so a list can name it without reading the forms itself. */
  documentLayoutName?: string
  copies?: DocumentTypeCopy[]
  /**
   * The kinds of document one of these may be taken over from, in the order they are
   * offered. Empty when a document of this kind is always written from scratch.
   */
  predecessorTypeIds?: number[]
  /** What a copy of such a document does with the amounts. */
  copyPriceMode?: CopyPriceMode
  active: boolean
}

/**
 * What happens to the amounts when a document is copied.
 *
 * <p>Only for a copy. Taking a document over from a predecessor always keeps the amounts.
 */
export type CopyPriceMode = 'COPY' | 'RECALCULATE'

/**
 * A document offered for takeover.
 *
 * <p>`alreadyTakenOver` is a hint, not a refusal: a partial delivery out of one offer is the
 * normal case.
 */
export type PredecessorCandidate = {
  id: number
  documentNumber: string
  documentDate: string
  partnerId: number
  partnerName: string
  totalGross: number
  currency: string
  alreadyTakenOver: boolean
}

// --- print layouts -----------------------------------------------------------

/** What a block on a designed form draws. Mirrors `ch.webux.office.printing.LayoutBlockType`. */
export type LayoutBlockType =
  | 'TEXT'
  | 'FIELD'
  | 'IMAGE'
  | 'LINE'
  | 'ADDRESS'
  | 'POSITIONS'
  | 'TOTALS'
  | 'VAT_SUMMARY'
  | 'DISCOUNT_STAGES'
  | 'PAYMENT_TERMS'
  | 'DOCUMENT_TEXT'

/** How a block looks. Every value is checked again on the server before it becomes CSS. */
export type LayoutStyle = {
  fontSize?: number
  bold: boolean
  align?: 'left' | 'right' | 'center'
  colour?: string
}

/**
 * One element of a form.
 *
 * <p>Blocks of the head and the foot carry millimetres from the top left of the printable
 * area. Blocks of the body carry none: they follow each other, because their height depends
 * on how much the document says.
 */
export type LayoutBlock = {
  type: LayoutBlockType
  field?: string
  text?: string
  image?: string
  columns: LayoutColumn[]
  x: number
  y: number
  width?: number
  height?: number
  style: LayoutStyle
}

/**
 * One column of the positions table, as the form asks for it.
 *
 * <p>Width and heading are optional: left out, the proposal from the server is used. A width
 * of zero means the column takes whatever is left over.
 */
export type LayoutColumn = {
  code: string
  widthMm?: number
  label?: string
}

/** Margins and the height of the two fixed bands, in millimetres. */
export type PageSetup = {
  marginTop: number
  marginRight: number
  marginBottom: number
  marginLeft: number
  headerHeight: number
  footerHeight: number
}

/** A form as the designer edits it and the renderer reads it. */
export type PrintLayoutDefinition = {
  page: PageSetup
  header: LayoutBlock[]
  body: LayoutBlock[]
  footer: LayoutBlock[]
}

/**
 * A form documents are printed on.
 *
 * <p>`system` means it is delivered with the application: it may be renamed and chosen, but
 * not drawn over — whoever wants to change it copies it first.
 */
export type PrintLayout = {
  id: number
  code: string
  name: string
  system: boolean
  active: boolean
  designed: boolean
  /** The kinds of document printed on it. Empty means nobody prints on this form. */
  usedBy?: DocumentTypeRef[]
  definition?: PrintLayoutDefinition
}

/** A kind of document named from somewhere else, with just enough to show and to link. */
export type DocumentTypeRef = {
  id: number
  code: string
  name: string
}

/** One value a form may place on the page. */
export type PrintoutField = {
  path: string
  label: string
  group: string
}

/** One column the positions table may show. */
export type PrintoutColumn = {
  code: string
  label: string
  widthMm: number
  numeric: boolean
}

/** What a form may show, as the server offers it. */
export type PrintLayoutFields = {
  fields: PrintoutField[]
  columns: PrintoutColumn[]
}

/**
 * One printed copy of a kind of document.
 *
 * <p>No entries means the document is printed once without a label. The copies decide what
 * comes out of the printer, never what is archived.
 */
export type DocumentTypeCopy = {
  position: number
  label: string
}

/** Name and address as they were frozen onto the document when it was issued. */
export type DocumentParty = {
  name?: string
  addressLine?: string
  street?: string
  buildingNumber?: string
  postalCode?: string
  town?: string
  country?: string
  uid?: string
  email?: string
}

export type DocumentLine = {
  lineNumber: number
  productId?: number
  productNumber?: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
  discountPercent?: number
  vatCategory?: string
  vatRate?: number
  priceIncludesVat: boolean
  revenueAccount?: string
  serviceDateFrom?: string
  serviceDateTo?: string
  lineNet: number
  lineVat: number
  lineGross: number
}

export type SalesDocument = {
  id: number
  documentTypeId: number
  documentTypeCode?: string
  category: DocumentCategory
  status: DocumentStatus
  /** Drawn only when the document is issued; a draft has none. */
  documentNumber?: string
  fiscalYear?: number
  documentDate: string
  finalisedAt?: string
  cancelledAt?: string
  /** The document this one was taken over from; absent when it was written from scratch. */
  predecessorDocumentId?: number
  /** Its number as it was frozen at takeover. */
  predecessorDocumentNumber?: string
  partnerId: number
  partnerNumber?: string
  recipient?: DocumentParty
  issuer?: DocumentParty
  language?: string
  currency: string
  baseCurrency?: string
  exchangeRate?: number
  exchangeRateDate?: string
  totalNet: number
  totalVat: number
  totalGross: number
  baseTotalNet?: number
  baseTotalVat?: number
  baseTotalGross?: number
  headerText?: string
  footerText?: string
  /** Payment term as its frozen code; absent when the tenant has none. */
  paymentTerm?: string
  paymentTermName?: string
  /** The sentence to print. Absent while the document is a draft: it names amounts. */
  paymentTermText?: string
  netDays?: number
  dueDate?: string
  referenceType?: ReferenceType
  /** Drawn with the document number, so a draft has none. */
  paymentReference?: string
  /** Filled when the document is issued, with the amounts of the final total. */
  discountStages?: DocumentDiscountStage[]
  /** Reference of the customer, printed so they can match the document to their order. */
  reference?: string
  lines?: DocumentLine[]
}

/** One discount stage of a document: pay by this date and this is what it costs. */
export type DocumentDiscountStage = {
  days: number
  percent: number
  discountDate: string
  discountAmount: number
  amountAfterDiscount: number
}

/**
 * One row of a document list: the head, without its lines.
 *
 * <p>Deliberately not a {@link SalesDocument}. A list of fifty documents used to carry every
 * line of every one of them; the lines come with the detail request.
 */
export type DocumentSummary = {
  id: number
  documentTypeId: number
  documentTypeCode?: string
  category: DocumentCategory
  status: DocumentStatus
  /** Drawn only when the document is issued; a draft has none. */
  documentNumber?: string
  fiscalYear?: number
  documentDate: string
  finalisedAt?: string
  cancelledAt?: string
  partnerId: number
  partnerNumber?: string
  /** Name of the recipient as it was when the document was written. */
  partnerName?: string
  currency: string
  totalNet: number
  totalGross: number
}

export type DocumentStatusEntry = {
  status: DocumentStatus
  changedAt: string
  changedBy?: string
  note?: string
}

// --- numbering ---------------------------------------------------------------

export type NumberRange = {
  tenantId: number
  documentTypeCode: string
  fiscalYear: number
  prefix?: string
  padding?: number
  nextNumber?: number
  /** What the next issued document will be called, for example `RE-2026-0042`. */
  nextDocumentNumber?: string
}
