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
  | 'line-kind'
  | 'offer-outcome'
  | 'offer-decline-reason'

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
  currencyId?: number
  /**
   * The currency documents for this partner are written in, as its ISO 4217 code.
   *
   * <p>Set on every stored partner: leaving it empty while the record is created makes the
   * backend write the currency of the tenant into it, so a document never has to guess.
   */
  currency?: string
  currencyLabel?: string
  /**
   * Credit limit in the bookkeeping currency of the tenant, never in {@link Partner.currency}.
   *
   * <p>A limit is watched over every open document of the partner, and those may be written
   * in different currencies; only the bookkeeping currency compares.
   */
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
  /**
   * Read-only: the base price in force today, read from `prices`.
   *
   * <p>There so a list can show and sort by one number. Absent when no base price row applies
   * today. It is never sent; the rows are the truth.
   */
  basePrice?: number
  /** Every price of this product, base price and group prices alike. */
  prices?: PriceRow[]
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

/**
 * One price of a product: for one price group or for none, from a quantity upwards, for a
 * stretch of time.
 *
 * <p>A row without `priceGroupId` is the base price, the step the resolution falls back to
 * when neither a customer price nor a group price applies. Both dates are inclusive and both
 * may be left out: no start means it has always applied, no end means until further notice.
 */
export type PriceRow = {
  /** Row id; echoed on read, ignored on write. */
  id?: number
  /** Absent for the base price. */
  priceGroupId?: number
  /** Quantity the price starts at; absent or 0 is the base entry. */
  minQuantity?: number
  /** ISO date, absent for no start. */
  validFrom?: string
  /** ISO date, absent for no end. */
  validTo?: string
  price: number
}

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

/**
 * A price agreed with one partner, from a minimum quantity upwards and for a stretch of time.
 *
 * <p>`id` says which row to rewrite; without one a row is added.
 */
export type PartnerPrice = {
  id?: number
  productId: number
  minQuantity?: number
  /** ISO date, absent for no start. */
  validFrom?: string
  /** ISO date, absent for no end. */
  validTo?: string
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

/**
 * One VAT rate period, as `ch.webux.office.product.web.VatRateDto` serialises it.
 *
 * <p>`validTo` is read-only: the backend closes and reopens periods itself when a change
 * is recorded or taken back.
 */
export type VatRatePeriod = {
  id?: number
  category: VatCategory
  validFrom: string
  validTo?: string
  rate: number
}

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
  /**
   * Only on offer kinds: how many days a new offer is valid, counted from its document
   * date. Absent when a new offer starts without a valid-until date.
   */
  offerValidityDays?: number
  active: boolean
  /**
   * True for the kind its step of a sale starts with. Exactly one per tenant and category,
   * and it is what a new document and a new customer are suggested (ADR-0054 of the backend).
   */
  categoryDefault?: boolean
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
 *
 * <p>Printer and tray are a note, not a command: no web API lets a page choose where a print
 * goes, so they are shown next to the print dialog and the user picks them there (ADR-0009).
 */
export type DocumentTypeCopy = {
  position: number
  label: string
  /** How many sheets of this copy, at least 1. */
  copies?: number
  printerId?: number
  /** What that printer is called, so a mask can name it without reading the printers. */
  printerName?: string
  trayId?: number
  /** What that tray is called, read only. */
  trayName?: string
  /**
   * The form this copy prints on. Absent means it is made from the document itself — a copy
   * with a form of its own is drawn on that form instead (ADR-0053 of the backend).
   */
  documentLayoutId?: number
  /** What that form is called, read only. */
  documentLayoutName?: string
  /** True for a copy that stays in the house and is never mailed to the customer. */
  internal?: boolean
}

/**
 * One of the copies a concrete document is printed in.
 *
 * <p>Materialised from the kind of document when the draft is started, and editable while it
 * stays a draft. Issuing the document freezes the list: a reprint has to come out the way it
 * went out.
 */
export type DocumentPrintout = {
  /** Row id; absent for a row the mask has just added. */
  id?: number
  /** Order in the print, 1 is the original. */
  position: number
  label: string
  copies: number
  printerId?: number
  printerName?: string
  trayId?: number
  trayName?: string
  /** The form this copy prints on; absent means the document itself (ADR-0053). */
  documentLayoutId?: number
  documentLayoutName?: string
  /** True for a copy that stays in the house and is never mailed to the customer. */
  internal?: boolean
}

/**
 * A printer of the tenant.
 *
 * <p>Carries no address of any kind. Nothing in this application talks to a printer; the name
 * and the place are there so a person standing in the office knows which machine is meant
 * (ADR-0042 of the backend).
 */
export type Printer = {
  id: number
  /** Short key, upper case, unique per tenant and fixed once the printer exists. */
  code: string
  name: string
  /** Where the machine stands, for example `2. OG, neben der Kueche`. */
  location?: string
  active?: boolean
  /** The trays it has. A printer with a single tray names none. */
  trays?: PrinterTray[]
}

/** One paper tray of a printer. */
export type PrinterTray = {
  /** Row id; absent for a tray the mask has just added. */
  id?: number
  code: string
  name: string
  /** Order in the list, 1 first. */
  position?: number
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

/**
 * What a line of a document is.
 *
 * <p>Only an `ITEM` is charged. The other three shape the printed document: a note between
 * two positions, a running total, a page break.
 */
export type DocumentLineKind = 'ITEM' | 'COMMENT' | 'SUBTOTAL' | 'PAGE_BREAK'

export type DocumentLine = {
  /** Position as it is printed: the rank of the line, without gaps. */
  lineNumber: number
  kind: DocumentLineKind
  productId?: number
  productNumber?: string
  /** Absent on a page break, and on a subtotal that carries no caption. */
  description?: string
  /** Second line of the description, printed under it. Only on an `ITEM`. */
  subtitle?: string
  /** Longer text under the description, printed as well. Only on an `ITEM`. */
  note?: string
  /** Only on an `ITEM`; the other kinds carry no figures. */
  quantity?: number
  unit?: string
  unitPrice?: number
  discountPercent?: number
  /**
   * Discount as an amount on the whole line, not per piece, in the same basis as
   * `unitPrice` — gross where the price includes VAT. Never set together with
   * `discountPercent`.
   */
  discountAmount?: number
  vatCategory?: string
  vatRate?: number
  priceIncludesVat: boolean
  revenueAccount?: string
  serviceDateFrom?: string
  serviceDateTo?: string
  lineNet: number
  lineVat: number
  lineGross: number
  /**
   * Only on a `SUBTOTAL`: the `ITEM` lines since the previous subtotal, added up by the
   * backend. The browser never sums a document itself.
   */
  subtotalNet?: number
  subtotalVat?: number
  subtotalGross?: number
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
  /** That language as it was named when the document was written, for showing a word. */
  languageLabel?: string
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
  /**
   * Which of the three amounts of a subtotal is the one to read, on paper and in the mask:
   * the gross one where this is true, the net one otherwise. It also takes the kind of
   * document into account — one that shows no VAT never leads with a gross subtotal.
   */
  subtotalsIncludeVat: boolean
  /**
   * Which price base the document is written in: true when every charged line carries a
   * gross price. Unlike {@link subtotalsIncludeVat} it knows nothing about VAT being shown,
   * so a delivery note can be priced gross and still print none. This is the one to ask when
   * a new line has to start on the base of the document; the two are not interchangeable.
   */
  pricesIncludeVat: boolean
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
  /** Only on offers: the day up to which the offer stands, as `yyyy-MM-dd`. Absent when no
   * validity was given. */
  validUntil?: string
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
  /** Only on offers: how the issued offer went. An offer without a mark counts as `OPEN`. */
  offerOutcome?: OfferOutcome
  /**
   * Only on offers: whether the open offer outlived its valid-until day. Computed by the
   * backend against its clock — the browser never compares dates itself.
   */
  offerExpired?: boolean
}

/** How an issued offer went: still waiting, turned into business, or turned down. */
export type OfferOutcome = 'OPEN' | 'ACCEPTED' | 'DECLINED'

/**
 * The follow-up state of one offer.
 *
 * <p>Answer of `GET /{offers}/{id}/tracking`. An offer nobody has touched yet answers as
 * `OPEN` with everything else absent — the row is only written when someone marks or
 * estimates the offer.
 */
export type OfferTracking = {
  outcome: OfferOutcome
  /**
   * Whether the open offer outlived its valid-until day. Always answered, computed by the
   * backend against its clock; an accepted or declined offer is never expired.
   */
  expired: boolean
  /** When the outcome was decided; absent while it is `OPEN`. */
  outcomeAt?: string
  /** Who decided it; absent while it is `OPEN`. */
  outcomeBy?: string
  /** Whole percent 0 to 100; absent while nobody estimated the offer. */
  winProbability?: number
  /** Why it was declined, as a code of the `offer-decline-reason` catalogue. */
  declinedReasonCode?: string
  declinedNote?: string
  /**
   * The gross total weighted by the probability, computed by the backend. Absent while no
   * probability is set. The browser never multiplies the two itself.
   */
  weightedGross?: number
}

/** One follow-up reminder of an offer, as `GET /{offers}/{id}/reminders` returns it. */
export type OfferReminder = {
  id: number
  /** When it is due, as an ISO instant; shown in the reader time zone. */
  dueAt: string
  note?: string
  done: boolean
  doneAt?: string
  doneBy?: string
  createdAt: string
  createdBy?: string
}

/**
 * One due reminder of the signed-in user, across every offer of the tenant.
 *
 * <p>Answer of `GET /{offers}/reminders/due`. It names the offer instead of pointing at one
 * already loaded, because the overview shows it without having any offer open.
 */
export type DueOfferReminder = {
  reminderId: number
  documentId: number
  /** The number of the offer; absent while it is a draft. */
  documentNumber?: string
  /** Name of the recipient as it stands on the offer. */
  partnerName?: string
  dueAt: string
  note?: string
}

/**
 * What a new document would carry for one customer, worked out by the backend.
 *
 * <p>Answer of `GET /{documents}/defaults?documentTypeId=&partnerId=`. It exists so the mask
 * that starts a document shows the values it is going to get instead of guessing them: which
 * address is used, which language the customer is written to in, which currency and which
 * payment term apply. Every one of them stays editable.
 */
export type DocumentDefaults = {
  /** Address as it would be frozen onto the document. */
  recipient?: DocumentParty
  partnerNumber?: string
  languageCode?: string
  languageLabel?: string
  currencyCode?: string
  currencyLabel?: string
  paymentTermId?: number
  paymentTermName?: string
  /** Which of the partner addresses the kind of document asks for. */
  addressUsage?: AddressUsage
  /**
   * The kind of document this answer is about: the one that was asked for, or the one this
   * customer gets for this step of a sale when none was named (ADR-0054 of the backend).
   */
  documentTypeId?: number
  documentTypeCode?: string
  documentTypeName?: string
}

/**
 * Which kind of document one customer gets for one step of a sale.
 *
 * <p>Always answers with a kind where the tenant has one, whether the customer was assigned
 * it or the default of the step applies. `overridden` says which of the two it was.
 */
export type PartnerDocumentType = {
  category: DocumentCategory
  documentTypeId: number
  documentTypeCode: string
  documentTypeName: string
  /** True when this customer carries a kind of its own instead of the default. */
  overridden: boolean
  /** Whether that kind may still be used for new documents. */
  active: boolean
}

export type DocumentStatusEntry = {
  status: DocumentStatus
  changedAt: string
  changedBy?: string
  note?: string
}

/**
 * One row of a partner's history: something that happened between the tenant and that
 * partner.
 *
 * <p>Not a {@link DocumentSummary}. A history row names the kind of document the way the
 * tenant calls it instead of by code, drops the recipient that is the same in every row, and
 * adds what a reader looks for in a record — the due date, the reference and the document it
 * was taken over from.
 *
 * <p>What is empty is `null` rather than absent: the backend answers every field of the
 * record, and a draft has no number the same way it has no `finalisedAt`.
 */
export type DocumentHistoryEntry = {
  id: number
  documentTypeId: number
  /** Code of that kind of document, for example `RE`. */
  documentTypeCode: string
  /** Name of that kind as the tenant wrote it; never translated here. */
  documentTypeName: string
  /** Behaviour this document follows, one of {@link DocumentCategory}. */
  category: string
  /** `DRAFT`, `FINALISED` or `CANCELLED`, one of {@link DocumentStatus}. */
  status: string
  /** The number as printed, `null` while it is a draft. */
  documentNumber: string | null
  fiscalYear: number | null
  documentDate: string
  /** When payment is due, `null` where nothing is owed. */
  dueDate: string | null
  /** What the partner asked us to quote. */
  reference: string | null
  predecessorDocumentNumber: string | null
  currency: string
  totalNet: number
  totalGross: number
  finalisedAt: string | null
  cancelledAt: string | null
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
