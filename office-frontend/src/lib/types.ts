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
  /**
   * Only on units: how many decimal places a quantity in this unit may carry.
   *
   * <p>Absent means no rule at all, 0 means whole numbers only. Read when a quantity is
   * entered, never frozen onto a document — it is an input rule, not a document value.
   */
  decimalPlaces?: number
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
  | 'negative-stock-policy'
  | 'movement-reason'
  | 'movement-source-kind'
  | 'product-tracking'
  | 'stocktake-status'

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
  /**
   * The modules this tenant runs, as the names of the backend `LicensedModule` values.
   *
   * <p>Travels with the session so the sidebar can hide a module the tenant does not run,
   * without a request of its own. Always present — a tenant that runs nothing sends an empty
   * list, never a missing field (backend ADR-0079).
   */
  modules: string[]
}

/**
 * One switchable module as the module screen shows it.
 *
 * <p>`usage` says what already lies in the module, so switching it off is a decision with
 * figures in front of it. Absent where nothing does.
 */
export type TenantModule = {
  code: string
  label: string
  description: string
  active: boolean
  usage?: string
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
  /**
   * How the account proves itself a second time, absent where nothing stands.
   *
   * <p>The preferred method where two of them do: whoever has an app is shown as having an
   * app (backend ADR-0087).
   */
  secondFactorMethod?: string
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
  /**
   * From which deviation on a counted difference needs a written reason, in percent of the
   * expected quantity.
   *
   * <p>Shipped with 5. `0` means «always a reason» and is a value like any other; leaving the
   * field out of a payload means «not stated», and the backend then keeps what it stored.
   */
  stocktakeReasonPercent?: number
  /**
   * The absolute floor under that percentage: below it no reason is ever asked for.
   *
   * <p>A quantity, not a percentage. Without it one piece out of two thousand would need a
   * written explanation, and explanations that are always demanded stop being read.
   */
  stocktakeReasonMinimum?: number
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
  /** Whether the stock of this product is followed at all. Only goods may. */
  stockManaged?: boolean
  tracking?: ProductTracking
  /**
   * The level a shortfall list warns below.
   *
   * <p>Absent means «do not watch at all»; 0 is a level and means «warn as soon as nothing
   * is left». The two are not the same thing.
   */
  minimumQuantity?: number
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
 * How closely the stock of a product is followed.
 *
 * <p>A lot names a batch produced or delivered together; a serial number names exactly one
 * piece. Switching this over is only harmless while nothing is in stock.
 */
export type ProductTracking = 'NONE' | 'LOT' | 'SERIAL'

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

/**
 * One product of the quick entry screen, as `PriceEntryRowDto` sends it.
 *
 * <p>Two prices, and the difference is the point. `effectivePrice` is what the chosen target
 * pays on the chosen day, wherever that price comes from; `ownPrice` is what the target has
 * of its own for exactly the period being edited, and only that one is written back.
 */
export type PriceEntryRow = {
  productId: number
  productNumber?: string
  name: string
  /** Absent where the article keeps none. The search runs over it, so a row may be here for it. */
  eanCode?: string
  unitLabel?: string
  /** Absent where nothing applies to this product at all. */
  effectivePrice?: number
  origin?: PriceOrigin
  /** Absent where the target has no price of its own for that period. */
  ownPrice?: number
  /** ISO date, first day of that own row. */
  ownValidFrom?: string
  /** ISO date, last day of that own row. */
  ownValidTo?: string
}

/**
 * What one save of the quick entry screen did.
 *
 * <p>`removed` and `closed` are changes nobody typed — a price taken away, and a running
 * price ended so the new period could start — so the screen says them out loud (ADR-0059).
 */
export type PriceEntryResult = {
  written: number
  removed: number
  closed: number
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

// --- inventory ---------------------------------------------------------------

/** What a location does when a booking would take its stock below zero. */
export type NegativeStockPolicy = 'WARN' | 'BLOCK'

/**
 * What issuing a document does to the stock.
 *
 * <p>A setting of the kind of document, not of its category: a business that never writes a
 * delivery note still has to move stock when it invoices (ADR-0064 of the backend).
 * `ISSUE_IF_NOT_BOOKED` books unless the same operation already did, which is what lets a
 * direct invoice book while an invoice after a delivery note does not. `RESERVE` speaks a
 * quantity for without moving it: the free quantity drops, the stock does not, and no movement
 * is written (ADR-0066 of the backend).
 */
export type StockEffect = 'NONE' | 'RESERVE' | 'ISSUE' | 'ISSUE_IF_NOT_BOOKED'

/**
 * One quantity that taking a document back would put into stock again, as
 * `StockReversalLineDto` sends it.
 *
 * <p>Read only, and nothing is booked to answer it. The reopen dialog names these before the
 * user confirms: taking a delivery note back is automatic, but the goods may already have left
 * the building.
 */
export type StockReversalLine = {
  productNumber?: string
  productName: string
  quantity: number
  unitShortName?: string
  locationName: string
}

/**
 * A place a tenant keeps goods in, as `StockLocationDto` sends it.
 *
 * <p>Flat on purpose: `binHint` is free text («Regal C3») and takes the place of a hierarchy
 * warehouse → zone → bin. `code` is read on create and never changes afterwards, and
 * `defaultLocation` is set through its own endpoint because it takes the mark off another
 * location.
 */
export type StockLocation = {
  id?: number
  code: string
  name: string
  binHint?: string
  note?: string
  active?: boolean
  defaultLocation?: boolean
  negativeStockPolicy?: NegativeStockPolicy
  sortOrder?: number
}

/** Which way a booked quantity goes. The API takes a positive quantity plus this. */
export type MovementDirection = 'IN' | 'OUT'

/** Why a quantity moved, as the catalogue `movement-reason` spells it. */
export type MovementReason =
  | 'OPENING'
  | 'RECEIPT'
  | 'CUSTOMER_RETURN'
  | 'ISSUE'
  | 'SCRAP'
  | 'OWN_USE'
  | 'LOSS'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'REVERSAL'
  | 'COUNT_ADJUSTMENT'

/** What made a movement happen, as the catalogue `movement-source-kind` spells it. */
export type SourceKind = 'MANUAL' | 'DOCUMENT' | 'STOCKTAKE'

/**
 * One line of the movement journal, as `StockMovementDto` sends it.
 *
 * <p>Read only from end to end: there is no endpoint that changes a movement and none that
 * deletes one. A mistake is corrected with a counter booking, which is another row of this
 * shape. Product number, name and unit are copies taken when it was booked, so a renamed
 * product leaves an old row exactly as it stands.
 */
export type StockMovement = {
  id: number
  productId: number
  productNumber?: string
  productName: string
  unitCode?: string
  unitShortName?: string
  locationId: number
  /** Signed: a receipt is positive, an issue negative. Never zero. */
  quantity: number
  reason: MovementReason
  /** The booking day as `YYYY-MM-DD`; may be earlier than today, never later. */
  bookedOn: string
  sourceKind: SourceKind
  sourceId?: number
  sourceNumber?: string
  /** The lot or serial number this row moved. Absent on a product nobody tracks. */
  lotId?: number
  /**
   * The number as it was written, frozen like the product name next to it.
   *
   * <p>A copy rather than a join: the journal, the search and the booking answer all need the
   * number, and it can never drift — a lot cannot be renamed once a movement points at it.
   */
  lotNumber?: string
  /** Ties the two lines of a transfer together. */
  transferGroupId?: number
  /** The movement this one takes back. */
  reversesMovementId?: number
  unitCost?: number
  unitCostCurrency?: string
  exchangeRate?: number
  exchangeRateDate?: string
  note?: string
  createdAt?: string
  createdBy?: string
}

/**
 * How much of one product lies at one location, as `StockBalanceDto` sends it.
 *
 * <p>A cache of the journal, and read only. There is no field here and no endpoint anywhere
 * that sets a stock.
 */
export type StockBalance = {
  productId: number
  locationId: number
  quantity: number
  /** What an issued order has spoken for. */
  reservedQuantity: number
  availableQuantity: number
  productNumber?: string
  productName: string
  productEan?: string
  unitShortName?: string
}

/** What a booking wrote, and what the stock looks like afterwards. */
export type StockBooking = {
  movements: StockMovement[]
  balances: StockBalance[]
}

/** What the booking dialog sends to book a quantity in or out. */
export type BookStockRequest = {
  productId: number
  locationId: number
  direction: MovementDirection
  reason: MovementReason
  /** Always above zero; the direction makes the sign. */
  quantity: number
  /** `YYYY-MM-DD`, absent means today. */
  bookedOn?: string
  unitCost?: number
  unitCostCurrency?: string
  exchangeRate?: number
  exchangeRateDate?: string
  note?: string
  /**
   * Which numbers the quantity is made of, for a product that is tracked.
   *
   * <p>One entry per lot or serial number; their quantities add up to {@link quantity}. Left
   * out for a product nobody tracks, where any entry would be refused.
   */
  lots?: LotAllocation[]
}

/** What the booking dialog sends to move goods from one location to another. */
export type TransferStockRequest = {
  productId: number
  fromLocationId: number
  toLocationId: number
  quantity: number
  bookedOn?: string
  note?: string
  /** Which numbers are moved; both halves of the transfer carry the same split. */
  lots?: LotAllocation[]
}

// --- lots and serial numbers -------------------------------------------------

/**
 * How a number stands for goods.
 *
 * <p>One model for both, not two: a serial number is a lot of exactly one piece. It follows
 * from {@link ProductTracking} and is never chosen by hand.
 */
export type LotKind = 'LOT' | 'SERIAL'

/**
 * A batch or a single piece under its number, as `LotDto` sends it.
 *
 * <p>Where the goods came from is not here and is not meant to be: that is what the journal
 * answers, filtered by this lot (backend ADR-0068).
 */
export type Lot = {
  id: number
  productId: number
  kind: LotKind
  lotNumber: string
  /** Warns and sorts, it never blocks. Absent on goods that do not expire. */
  expiryDate?: string | null
  /** True once the expiry date has passed. Such a lot stays choosable. */
  expired: boolean
  blocked: boolean
  blockedReason?: string | null
  note?: string | null
  /** What lies under this number over all locations. */
  quantity: number
  locations: LotLocationQuantity[]
  createdAt?: string
  changedAt?: string | null
}

/** How much of one lot lies at one location, as `LotLocationQuantityDto` sends it. */
export type LotLocationQuantity = {
  locationId: number
  locationName: string
  quantity: number
}

/**
 * One line of what the server suggests taking, as `LotProposalLineDto` sends it.
 *
 * <p>A line with no number is the stock that was there before the product was tracked. It can
 * be used up but never added to.
 */
export type LotProposalLine = {
  lotId: number | null
  lotNumber: string | null
  expiryDate: string | null
  expired: boolean
  /** What lies at the asked location under this number. */
  available: number
  /** What the server would take from it. Zero on an expired lot: choosable, never chosen. */
  proposed: number
}

/**
 * What to take out, earliest expiry first, as `LotProposalDto` sends it.
 *
 * <p>Suggests and books nothing. `uncovered` is what the location cannot cover at all — the
 * booking may still go through where the location only warns.
 */
export type LotProposal = {
  lines: LotProposalLine[]
  /** The stock without a number, as one line. Zero available where there is none. */
  withoutNumber: LotProposalLine
  uncovered: number
}

/**
 * One number that went out on a document, as `IssuedLotDto` sends it.
 *
 * <p>What a return is filled in from: a customer sends back what was delivered, so the mask
 * offers the numbers that last left the house rather than the ones the product happens to
 * carry. It suggests and binds nothing — the choice on a return is free, and a number that is
 * not in this list is warned about and never refused (backend ADR-0073).
 *
 * <p>At most twenty of them come back, so the list is an extract and never a proof: a number
 * missing from it may well be out with a customer (backend ADR-0073).
 */
export type IssuedLot = {
  lotNumber: string
  /** How many pieces left on that document, always positive. */
  quantity: number
  /** The day it left, `YYYY-MM-DD`. */
  bookedOn: string
  /** The document it left on. Only what a document booked is ever listed. */
  documentNumber: string
}

/**
 * Where one serial number lies right now, as `SerialNumberHoldingDto` sends it.
 *
 * <p>What a return asks before it is issued. A piece that is already lying somewhere cannot
 * arrive a second time, and the server refuses it — but only when the document is issued, which
 * on a return over twenty devices is twenty positions too late (backend ADR-0077, ADR-0081).
 *
 * <p>The server decides what is worth saying, not the mask: a batch, a number nobody ever wrote
 * down and a number that lies nowhere all come back **without** `locationName`. The rule that
 * only single pieces are refused lives in one place, and it is not this one.
 */
export type SerialNumberHolding = {
  /** The number as the lot master holds it, or as it was asked for where there is no lot. */
  lotNumber: string
  /** What the location holding it is called, absent where nothing is worth a warning. */
  locationName?: string | null
}

/**
 * One number and what of the booked quantity falls on it, as `LotAllocationRequest` takes it.
 *
 * <p>`lotNumber: null` means the stock without a number and is only allowed on the way out.
 * The quantity is always positive — the direction of the booking makes the sign.
 */
export type LotAllocation = {
  lotNumber: string | null
  quantity: number
}

/** What the generator is asked for; it computes numbers and saves nothing. */
export type SerialNumberProposalRequest = {
  prefix?: string
  start: number
  count: number
  /** How many digits the running number is padded to. */
  padding?: number
}

/** The computed numbers, as `SerialNumbersDto` sends them. */
export type SerialNumbers = {
  numbers: string[]
}

/** What the lot dialog sends when a lot is created or changed. */
export type LotRequest = {
  lotNumber: string
  expiryDate?: string
  note?: string
}

/** What the lot dialog sends to freeze a lot. The reason is shown wherever it is refused. */
export type BlockLotRequest = {
  reason: string
}

/** Why a stock needs attention, as `ShortageCause` spells it. */
export type ShortageCause = 'NEGATIVE' | 'BELOW_MINIMUM'

/**
 * One line of the stock list, as `StockRowDto` sends it.
 *
 * <p>One row per product and location; lots sit a level below and do not lengthen this list.
 * Number, name, bar code and unit are the copies frozen at the last booking, not today's
 * values — this is the view of what was booked.
 */
export type StockRow = {
  productId: number
  productNumber?: string
  productName: string
  productEan?: string
  unitShortName?: string
  locationId: number
  locationName: string
  quantity: number
  /** What an issued order has spoken for. */
  reservedQuantity: number
  /** Free to be given away: stock less what is spoken for. */
  availableQuantity: number
  /** The level warned below. Absent means «do not watch at all»; 0 is not the same thing. */
  minimumQuantity?: number
  /** What is wrong with this stock. Absent while all is well. */
  shortage?: ShortageCause
}

/**
 * One line of the shortfall list, as `ShortageRowDto` sends it: one job somebody has to do.
 *
 * <p>Number, name, bar code and unit are today's values — the list is driven by the product
 * list, and a product without a single booking has no frozen copy anywhere.
 *
 * <p>`locationId` and `locationName` are absent for `BELOW_MINIMUM`: the minimum belongs to
 * the product and is counted over every location.
 */
export type ShortageRow = {
  productId: number
  productNumber?: string
  productName: string
  productEan?: string
  unitShortName?: string
  locationId?: number
  locationName?: string
  quantity: number
  availableQuantity: number
  minimumQuantity?: number
  /** How much is missing, always positive. */
  missingQuantity: number
  cause: ShortageCause
}

/**
 * Where a reservation stands in its life.
 *
 * <p>Three states and two ways out. `OPEN` counts against the free quantity, `CONSUMED` was
 * delivered in full, `RELEASED` was given back — by a Storno, by a reopen, or by hand.
 */
export type StockReservationStatus = 'OPEN' | 'CONSUMED' | 'RELEASED'

/**
 * A quantity one document has spoken for, as `ReservationDto` sends it.
 *
 * <p>Read only, except for the one endpoint that releases it. Nothing sets a reserved
 * quantity: it is written when an order is issued and used up when a delivery note goes out
 * (ADR-0066 of the backend).
 *
 * <p>Product number, name and unit are the copies frozen when the order was issued, not
 * today's values — the same rule the movement journal follows.
 */
export type StockReservation = {
  id: number
  productId: number
  productNumber?: string
  productName: string
  unitShortName?: string
  locationId: number
  locationName: string
  /** How much was spoken for, always above zero. */
  quantity: number
  /** How much of it deliveries have used up. */
  quantityReleased: number
  /** What is still spoken for; this is what the free stock is short of. */
  openQuantity: number
  status: StockReservationStatus
  /** The document that reserved. */
  sourceId?: number
  /** The line of that document that reserved. */
  sourceLineId?: number
  sourceNumber?: string
  /** The day it was reserved on, as `YYYY-MM-DD`. */
  reservedOn: string
  releasedAt?: string
  releasedBy?: string
  releasedReason?: string
}

/** What the release dialog sends to end one reservation by hand. */
export type ReleaseReservationRequest = {
  /** Required, at most 60 characters. */
  reason: string
}

/**
 * One document holding part of a quantity back, as `ReservationHolderDto` sends it.
 *
 * <p>The answer to the only question a seller asks after «why can I not deliver this»: who is
 * it promised to.
 */
export type ReservationHolder = {
  documentNumber?: string
  /** How much of the product that document still holds, always above zero. */
  quantity: number
}

/** What one location holds of one product, as `LocationAvailabilityDto` sends it. */
export type LocationAvailability = {
  locationId: number
  locationName: string
  onHand: number
  reserved: number
  availableQuantity: number
}

/**
 * What is free of one product, as `ProductAvailabilityDto` sends it.
 *
 * <p>One figure carries the answer: `availableQuantity` is stock less what issued orders have
 * spoken for. Stock and reserved quantity stand next to it so it can be checked.
 *
 * <p><b>The three quantities are absent when no stock is kept of this product</b>, and that is
 * not the same as zero — a 0 next to a service reads as «sold out» and is a false statement.
 * Read `stockManaged`, never the figures.
 *
 * <p>`locations` and `heldBy` are empty on the batch answer: a hit list has no room for them,
 * and reading them per row would cost one request per hit.
 */
export type ProductAvailability = {
  productId: number
  stockManaged: boolean
  onHand?: number
  reserved?: number
  /** Stock less what is spoken for. Negative means more is promised than is there. */
  availableQuantity?: number
  locations?: LocationAvailability[]
  heldBy?: ReservationHolder[]
}

/** One document holding part of a quantity back, as `StockHolderDto` sends it. */
export type StockHolder = {
  documentNumber?: string
  quantity: number
}

/**
 * One product a document asks for more of than its location has free, as `StockShortfallDto`
 * sends it.
 *
 * <p>One entry per product, not per position — two positions over the same article are one
 * shortfall. Which positions they were travels in `lineNumbers`.
 *
 * <p>No product name: the description stands on the document line the mask already holds.
 */
export type StockShortfall = {
  /** The printed positions this demand comes from, in printing order. */
  lineNumbers: number[]
  productId: number
  locationName: string
  /** What the document asks for, added up over its positions. */
  required: number
  onHand: number
  reserved: number
  /** Stock less what is spoken for, may be negative. */
  available: number
  heldBy: StockHolder[]
  /** True where issuing would be refused rather than only warned about. */
  blocking: boolean
}

/**
 * What a document would be short of if it were issued now, as `StockCheckDto` sends it.
 *
 * <p>A reading: asking books nothing, holds nothing and changes nothing. An empty list means
 * covered — and so does the answer for a kind of document that moves no stock at all.
 */
export type StockCheck = {
  shortfalls: StockShortfall[]
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
  /** What issuing a document of this kind does to the stock (ADR-0064 of the backend). */
  stockEffect?: StockEffect
  /** The location it books at; absent means the tenant's default one. */
  stockLocationId?: number
  /**
   * What that location is called. Worked out on the server, because only it knows which one it
   * is: the one this kind names, or the tenant's default. Absent when the kind moves no stock.
   */
  stockLocationName?: string
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
 * <p>`openLineCount` is a hint, not a refusal: a partial delivery out of one offer is the
 * normal case. It counts only issued follow-ups of the kind being written, so a draft takes
 * nothing away and a delivered Auftrag is still fully open for the Rechnung.
 */
export type PredecessorCandidate = {
  id: number
  documentNumber: string
  documentDate: string
  partnerId: number
  partnerName: string
  totalGross: number
  currency: string
  /** How many charged positions it carries. */
  itemLineCount: number
  /** How many of them still have something open; zero means the document is done. */
  openLineCount: number
}

/**
 * What is still open on one position of a document, for a kind of follow-up to take over.
 *
 * <p>Three numbers where a mask used to show one. The backend works them out from the lines
 * pointing at that position; nothing here is added up in the browser.
 */
export type OpenLineQuantity = {
  /** Database id of the line, which a taken-over line names as its `predecessorLineId`. */
  lineId: number
  /** Its printed position on the source document. */
  lineNumber: number
  productId?: number
  productNumber?: string
  description?: string
  /** The unit in its short form, for example `Std.`. */
  unit?: string
  orderedQuantity: number
  deliveredQuantity: number
  openQuantity: number
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
  /**
   * The line of the predecessor document this one was taken over from; absent when it was
   * written from scratch. Lets the mask hold the quantity entered here against what is still
   * open on that line.
   */
  predecessorLineId?: number
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
  /**
   * The batches or serial numbers this position moves, frozen onto the line. Empty where it
   * moves none (backend ADR-0069).
   */
  lots?: DocumentLineLot[]
}

/**
 * One batch or serial number of a document line, as `DocumentLineLotDto` sends it.
 *
 * <p>A frozen copy, not a reference: a reprint in ten years shows what the document said, even
 * after the lot was corrected in the inventory.
 */
export type DocumentLineLot = {
  lotNumber: string
  tracking: LotKind
  /** Signed like the line: a return carries negative entries. */
  quantity: number
  expiryDate?: string
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
  /**
   * Discount on the whole document as a percentage; absent when none was given or an amount
   * was. Already deducted from the totals above (ADR-0058 of the backend).
   */
  discountPercent?: number
  /** That discount as an amount without VAT; absent when none was given or a percentage was. */
  discountAmount?: number
  /** What the discount comes to without VAT; 0 where there is none. */
  discountNet?: number
  /** The VAT that falls away with it. */
  discountVat?: number
  /**
   * What a discount could reduce at all: the net sum of the positions the catalogue allows to
   * be reduced. The mask needs it to say what a percentage would come to before it is saved.
   */
  discountableBase?: number
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
  /**
   * What issuing this document does to the stock. Comes from its kind of document, so the mask
   * can say what the Ausstellen button will do before it is pressed.
   */
  stockEffect?: StockEffect
  /**
   * The store this document itself names. Absent while it follows its kind of document — an
   * empty picker is not "no store" but "Vorgabe der Belegart" (ADR-0067 of the backend).
   */
  stockLocationId?: number
  /**
   * The store it really books at, already worked out over document, kind of document and
   * tenant default. What the mask picks out of the per-store breakdown of the inventory, so it
   * never holds that precedence rule a second time. Absent when it moves no stock.
   */
  effectiveStockLocationId?: number
  /**
   * What the location it books at is called. Absent when it moves no stock. Worked out on the
   * server: only it knows whether the document names a store, its kind names one, or the
   * tenant's default applies.
   */
  stockLocationName?: string
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
  /**
   * Only on Rechnungen that carry a receivable: what the customer still owes, worked out by
   * the backend and never stored. Negative means the customer overpaid. Absent — not zero —
   * on a draft, a reversed Rechnung, the counter document of a reversal, and every other
   * category (backend ADR-0091).
   */
  openAmount?: number
  /** Only where `openAmount` is: whether money is open and the due day has passed. */
  overdue?: boolean
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
  /** What comes out of the printer for this customer, copy by copy. */
  copies?: PartnerDocumentCopy[]
}

/**
 * One copy of a kind of document, as one customer gets it.
 *
 * <p>Carries both numbers: what the kind of document asks for, and what this customer
 * agreed. Only a difference between the two is stored (ADR-0055 of the backend).
 */
export type PartnerDocumentCopy = {
  /** Which copy, by its place in the printing order. */
  position: number
  label: string
  /** How many sheets the kind of document asks for. */
  defaultCopies: number
  /** How many sheets this customer gets; 0 means they do not get it at all. */
  copies: number
  /** True when this customer deviates from the kind of document here. */
  overridden: boolean
}

/**
 * How one document of a chain hangs together with the one that was asked about.
 *
 * <p>`RELATED` is the second Lieferschein of the same Auftrag: on the chain, but not on the
 * way to this document.
 */
export type DocumentRelation = 'SELF' | 'PREDECESSOR' | 'SUCCESSOR' | 'REVERSAL' | 'RELATED'

/**
 * One document of the chain another one hangs on.
 *
 * <p>A read model: what a list row shows, plus how it relates. The relation is the point —
 * a list of numbers alone would leave the reader to work out which came out of which.
 */
export type DocumentChainEntry = {
  id: number
  documentTypeCode: string
  documentTypeName: string
  category: DocumentCategory
  status: DocumentStatus
  /** Absent while it is a draft. */
  documentNumber?: string
  documentDate: string
  currencyCode: string
  totalGross: number
  finalisedAt?: string
  cancelledAt?: string
  relation: DocumentRelation
  /** How many takeovers lie between the two; negative upstream, positive downstream. */
  distance: number
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

// --- inventory counts (backend ADR-0070) -------------------------------------

/** Where a count list stands. It never goes back. */
export type StocktakeStatus = 'DRAFT' | 'COUNTING' | 'POSTED'

/** What a count list covers: the whole location, or the chosen products. */
export type StocktakeScope = 'ALL' | 'SELECTION'

/**
 * What happens to the lines nobody counted.
 *
 * <p>Never decided silently: the posting dialog offers both without a preselection, and the
 * answer stays on the record — an incomplete count must never look like a complete one.
 */
export type UncountedHandling = 'KEEP' | 'SKIP'

/**
 * One count list, as `StocktakeDto` sends it.
 *
 * @see StocktakeLine for what it is counted from
 */
export type Stocktake = {
  id: number
  /** Drawn when it is booked; a list that was never booked has none. */
  stocktakeNumber?: string
  fiscalYear?: number
  locationId: number
  locationName?: string
  status: StocktakeStatus
  scope: StocktakeScope
  /** True while the expected quantity stays hidden from whoever counts. */
  blindCount: boolean
  countingDate: string
  note?: string
  /** What was chosen for the uncounted lines; absent until it is booked. */
  uncountedHandling?: UncountedHandling
  lineCount: number
  countedCount: number
  differenceSum?: number
  openedAt?: string
  postedAt?: string
  /**
   * How big the archived inventory protocol is, in bytes. Absent while the list is not booked,
   * and absent in the list, which does not read the archive — so a mask can name the size of
   * the file it offers without fetching it.
   */
  protocolByteCount?: number
  /** When that protocol was written, which is the moment the list was booked. */
  protocolCreatedAt?: string
  createdBy?: string
  changedBy?: string
}

/**
 * One line of a count list, as `StocktakeLineDto` sends it.
 *
 * <p>On a blind count `expectedQuantity` is absent while it is being counted — the server does
 * not send it at all, so it is not one request away either.
 */
export type StocktakeLine = {
  id: number
  productId: number
  productNumber?: string
  productName: string
  productEan?: string
  unitShortName?: string
  lotId?: number
  lotNumber?: string
  expectedQuantity?: number
  /** What somebody counted, absent while nobody has. Zero is a count, absent is not. */
  countedQuantity?: number
  countedAt?: string
  countedBy?: string
  stockAtPosting?: number
  differenceQuantity?: number
  differenceReason?: string
  movementId?: number
  /** True where a movement ran on this product between the start of the count and the booking. */
  movedSinceCounting: boolean
  /** True for goods that turned up and stood in no stock row. */
  addedDuringCounting: boolean
  sortOrder: number
}

/**
 * One line of the difference list, as `StocktakeDifferenceDto` sends it.
 *
 * <p>Only the lines that differ: what matches needs no decision.
 */
export type StocktakeDifference = {
  lineId: number
  productId: number
  productNumber?: string
  productName: string
  unitShortName?: string
  lotNumber?: string
  expectedQuantity: number
  /** What lies there now. Differs from the expected quantity where stock moved during the count. */
  stockNow: number
  countedQuantity?: number
  /** Counted minus stockNow, which is what would be booked. */
  difference: number
  movedSinceCounting: boolean
  /** True where this difference is above the tenant's threshold and has to be explained. */
  needsReason: boolean
  differenceReason?: string
}

/** One step of a count list through its states, as `StocktakeStatusEntryDto` sends it. */
export type StocktakeStatusEntry = {
  status: StocktakeStatus
  changedAt: string
  changedBy: string
  note?: string
}

/**
 * One line of the stock report for a cut-off date, as `StockAsOfDto` sends it.
 *
 * <p>Worked out from the movement journal, never from the projection: a balance sheet asks
 * about the 31st of December, and the projection knows today (backend ADR-0071). Number, name
 * and unit are the ones frozen onto the last movement up to that day, so a report on an old
 * date shows the wording of back then.
 */
export type StockAsOfEntry = {
  productId: number
  productNumber?: string
  productName: string
  locationId: number
  locationCode: string
  locationName: string
  quantity: number
  unitShortName?: string
  /** The last cost recorded up to the cut-off date; absent where none ever was. */
  unitCost?: number
  unitCostCurrency?: string
  /** Quantity times cost. Absent where there is no cost — never 0. */
  lineValue?: number
}

/**
 * What the whole stock report for a cut-off date adds up to, as `StockAsOfSummaryDto` sends it.
 *
 * <p>`showsValue` comes from the server rather than being worked out here: the all-or-nothing
 * rule of the value column belongs in one place.
 */
export type StockAsOfSummary = {
  asOf: string
  /** When it was worked out. The report is a recalculation and may read differently tomorrow. */
  generatedAt: string
  lineCount: number
  unvaluedLineCount: number
  foreignCurrencyLineCount: number
  baseCurrencyCode?: string
  /** Absent as soon as one line cannot be valued. A total that leaves lines out is no total. */
  totalValue?: number
  /** Bookings dated up to the cut-off date that were entered after it. There is no period lock. */
  backdatedMovements: number
  showsValue: boolean
}

// --- outbox ------------------------------------------------------------------

/** How a mail account signs in. One value today; Microsoft 365 follows. */
export type AuthKind = 'SMTP_PASSWORD'

/** How the connection to the mail server is protected. */
export type SmtpSecurity = 'NONE' | 'STARTTLS' | 'SSL'

/** What became of one queued mail. */
export type MessageStatus = 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED'

/**
 * The mail account of a tenant, as `MailAccountDto` sends it.
 *
 * <p>`passwordSet` and never the password itself: the backend hands it out nowhere, not even
 * as a cipher (backend ADR-0083). The mask therefore says «gespeichert» and offers an empty
 * field, and an empty field means «unchanged».
 */
export type MailAccount = {
  authKind: AuthKind
  host: string
  port: number
  security: SmtpSecurity
  username?: string
  senderAddress: string
  senderName?: string
  replyTo?: string
  active: boolean
  passwordSet: boolean
}

/** One row of the outbox list, as `OutboxSummaryDto` sends it. */
export type OutboxSummary = {
  id: number
  status: MessageStatus
  /** Every recipient in one line, the way the row shows it. */
  recipients: string
  subject: string
  attempts: number
  sentAt?: string
  lastError?: string
  createdAt: string
}

/** What hung on a mail, as `OutboxMessageDto.AttachmentDto` sends it. */
export type OutboxAttachment = {
  id: number
  fileName: string
  mediaType: string
  byteCount: number
}

/** One mail with its text and what hung on it, as `OutboxMessageDto` sends it. */
export type OutboxMessage = {
  id: number
  status: MessageStatus
  senderAddress: string
  senderName?: string
  replyTo?: string
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  body: string
  bodyHtml?: string
  /** `DOCUMENT` where a document was sent; absent for a free mail. */
  sourceModule?: string
  /** The document category, for example `INVOICE`. */
  sourceKind?: string
  sourceId?: number
  attachments: OutboxAttachment[]
  attempts: number
  nextAttemptAt?: string
  sentAt?: string
  lastError?: string
  createdAt: string
}

/**
 * One covering text, as `MailTemplateDto` sends it.
 *
 * <p>`overridden` false means the shipped text: the tenant has no row of its own, and what
 * stands in `subject` and `body` is what the application brings along (backend ADR-0085).
 */
export type MailTemplate = {
  categoryCode: string
  categoryLabel: string
  languageCode: string
  subject: string
  body: string
  overridden: boolean
}

/** What a document mail would look like, as `DocumentMailPreviewDto` sends it. */
export type DocumentMailPreview = {
  documentNumber: string
  to: string[]
  subject: string
  body: string
  senderAddress: string
  fileName: string
  byteCount: number
}

// --- second factor -----------------------------------------------------------

/**
 * Whether an account is protected, and how well.
 *
 * <p>As `SecondFactorStateDto` sends it. Never the secret and never the recovery codes —
 * those exist in readable form for exactly one moment.
 */
export type SecondFactorState = {
  enrolled: boolean
  /** How it is delivered, absent where nothing stands. */
  method?: string
  /** How many codes off the paper list are still good. */
  remainingRecoveryCodes: number
}

/** What a mask needs to get a second factor into an authenticator app. */
export type SecondFactorEnrolment = {
  /** The shared secret in Base32, for typing in where a camera fails. */
  secret: string
  otpAuthUri: string
  /** The link as an SVG image, ready to be put into the page. */
  qrSvg: string
}

/**
 * The codes that get somebody in without their telephone.
 *
 * <p>The only moment they are readable. Whoever does not put them in front of the user now
 * has lost them.
 */
export type RecoveryCodes = {
  codes: string[]
}

/** How an open item was settled. Only `PAYMENT` is money that arrived. */
export type PaymentKind = 'PAYMENT' | 'CREDIT' | 'DISCOUNT' | 'WRITE_OFF' | 'ROUNDING'

/** Whether a human or a statement import wrote a settlement line. */
export type PaymentSource = 'MANUAL' | 'IMPORT'

/**
 * One settlement line on a Rechnung.
 *
 * <p>Append only: a line is never changed and never deleted, it is taken back by a counter
 * line that carries the opposite amount (backend ADR-0091).
 */
export type Payment = {
  id: number
  documentId: number
  kind: PaymentKind
  /** Positive reduces the open item, negative is a counter line. */
  amount: number
  currency: string
  /** The day the money was valued, not the day somebody typed it. */
  valueDate: string
  source: PaymentSource
  /** Set on a counter line: the line it takes back. */
  reversesPaymentId?: number
  /** Set on a line that was taken back: the counter line that did it. */
  reversedByPaymentId?: number
  note?: string
  recordedAt: string
  recordedBy: string
}

/** What one Rechnung still owes. Every figure is worked out, none of it is stored. */
export type OpenItem = {
  documentId: number
  documentNumber?: string
  documentDate: string
  /** Absent when no payment term was printed on the Rechnung. */
  dueDate?: string
  partnerId: number
  partnerNumber?: string
  partnerName?: string
  currency: string
  totalGross: number
  /** Everything set against it: payments, credits, Skonto, write-offs. */
  settled: number
  /** Total minus settled. Negative means the customer overpaid. */
  open: number
  overdue: boolean
  /** Days past the due day, 0 while it is not overdue. */
  daysOverdue: number
}

/** Whether a customer gets one reminder per invoice or one letter for all of them. */
export type DunningGrouping = 'PER_INVOICE' | 'PER_PARTNER'

/** How a dunning fee reaches the books. Stored now, evaluated from issue 8/9. */
export type FeeBooking = 'SEPARATE_INVOICE' | 'ON_DUNNING_ONLY'

/**
 * How a dunning fee is treated for VAT.
 *
 * <p>The application does not decide the question, it carries the answer: whether a fee is
 * taxable consideration or damages under MWSTG Art. 18 Abs. 2 is disputed, and the tenant
 * follows its Treuhänder (backend ADR-0093).
 */
export type FeeVatMode = 'FOLLOWS_INVOICE' | 'FIXED_RATE' | 'NON_CONSIDERATION'

/** How a tenant runs its dunning. */
export type DunningSettings = {
  numberRangeCode: string
  /** Below this nothing is chased, in the accounting currency. 0 chases every rappen. */
  minimumOpenAmount: number
  showPaymentPart: boolean
  grouping: DunningGrouping
  feeBooking: FeeBooking
  feeVatMode: FeeVatMode
  feeVatCategory?: string
  feeRevenueAccountId?: number
  feeDocumentTypeId?: number
  /** How many levels are switched on — the answer to «wie viele Stufen hat es». */
  activeLevelCount: number
  /** Whether the settings say enough for a fee to be charged at all. */
  feeBookable: boolean
}

/**
 * One step of the dunning: when it falls due, how long it grants, and what it costs.
 *
 * <p>`dunningTypeName` is the name **in the administration**, from the catalogue
 * *Mahnarten*. The printed title per language is something else and arrives with issue 3/9.
 */
export type DunningLevel = {
  id: number
  levelNo: number
  dunningTypeId: number
  dunningTypeName?: string
  daysAfterDue: number
  paymentDays: number
  minDaysSincePrevious: number
  /** 0.00 unless agreed by contract: Swiss law knows no statutory dunning fee. */
  feeAmount: number
  active: boolean
}

/** How one customer is chased, and whether that is their own setting or the default. */
export type PartnerDunningGrouping = {
  partnerId: number
  grouping: DunningGrouping
  /** False means the answer is the tenant's default and will move with it. */
  deviation: boolean
}
