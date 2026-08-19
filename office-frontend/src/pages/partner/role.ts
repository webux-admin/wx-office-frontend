/**
 * Wording of the two masks that show the same records.
 *
 * <p>The backend knows one kind of record, the partner, carrying two flags. On screen that
 * word never appears: somebody is a customer or a supplier, and which one is decided by the
 * mask you opened. A record with both flags is in both lists and is called by the name of the
 * list it was reached through.
 *
 * <p>Every sentence is written out rather than assembled from the noun. German inflection is
 * not concatenation: "den Kunden" is not "den Kunde", and a template that glues an ending on
 * produces exactly that kind of mistake.
 */
export type PartnerRole = 'customer' | 'supplier'

export type RoleWording = {
  role: PartnerRole
  /** The other role, offered on the mask as an additional one. */
  other: PartnerRole
  /** Route this mask lives under, without a trailing slash. */
  path: string
  /** Value of the `role` parameter that makes the list endpoint answer with this role. */
  listQuery: string
  /** Heading of the list. */
  listTitle: string
  /** Counted noun under the heading, as in "8 Kunden". */
  countedNoun: string
  /** Label of the number field, which the backend hands out when it is left empty. */
  numberLabel: string
  /** Label of the way back from the mask to the list. */
  backLabel: string
  newTitle: string
  newSubtitle: string
  createAction: string
  firstAction: string
  loadingLabel: string
  searchPlaceholder: string
  emptyTitle: string
  emptyBody: string
  deactivateTitle: string
  deactivateBody: string
  /** Complaint when the name of a company is missing. */
  nameMissing: string
  /** Complaint when the family name of a private person is missing. */
  lastNameMissing: string
  /** Label of the checkbox for this role. */
  ownRoleLabel: string
  ownRoleHint: string
  /** Label of the checkbox for the other role. */
  otherRoleLabel: string
  otherRoleHint: string
  /** Badge shown in the list when the record also holds the other role. */
  alsoBadge: string
  addressPanelTitle: string
  addressPanelHint: string
}

const CUSTOMER: RoleWording = {
  role: 'customer',
  other: 'supplier',
  path: '/kunden',
  listQuery: 'role=customer',
  listTitle: 'Kunden',
  countedNoun: 'Kunden',
  numberLabel: 'Kundennummer',
  backLabel: 'Kunden',
  newTitle: 'Neuer Kunde',
  newSubtitle: 'Die Kundennummer vergibt das Backend beim Speichern.',
  createAction: 'Kunde erfassen',
  firstAction: 'Ersten Kunden erfassen',
  loadingLabel: 'Kunde wird geladen',
  searchPlaceholder: 'Name oder Kundennummer',
  emptyTitle: 'Noch keine Kunden',
  emptyBody: 'Ohne Kunden gibt es niemanden, an den ein Auftrag gehen könnte.',
  deactivateTitle: 'Kunde deaktivieren',
  deactivateBody:
    'Nichts wird gelöscht. Der Kunde steht danach nur nicht mehr zur Auswahl. Bestehende Belege bleiben unverändert.',
  nameMissing: 'Ohne Namen lässt sich der Kunde nicht speichern.',
  lastNameMissing: 'Ohne Nachnamen lässt sich der Kunde nicht speichern.',
  ownRoleLabel: 'Kunde',
  ownRoleHint: 'Kann Empfänger von Aufträgen sein.',
  otherRoleLabel: 'Auch Lieferant',
  otherRoleHint: 'Von dieser Firma wird zusätzlich eingekauft.',
  alsoBadge: 'Auch Lieferant',
  addressPanelTitle: 'Adresse',
  addressPanelHint: 'Ohne Adresse lässt sich kein Auftrag an diesen Kunden ausstellen.',
}

const SUPPLIER: RoleWording = {
  role: 'supplier',
  other: 'customer',
  path: '/lieferanten',
  listQuery: 'role=supplier',
  listTitle: 'Lieferanten',
  countedNoun: 'Lieferanten',
  numberLabel: 'Lieferantennummer',
  backLabel: 'Lieferanten',
  newTitle: 'Neuer Lieferant',
  newSubtitle: 'Die Lieferantennummer vergibt das Backend beim Speichern.',
  createAction: 'Lieferant erfassen',
  firstAction: 'Ersten Lieferanten erfassen',
  loadingLabel: 'Lieferant wird geladen',
  searchPlaceholder: 'Name oder Lieferantennummer',
  emptyTitle: 'Noch keine Lieferanten',
  emptyBody: 'Hier stehen die Firmen, bei denen eingekauft wird.',
  deactivateTitle: 'Lieferant deaktivieren',
  deactivateBody:
    'Nichts wird gelöscht. Der Lieferant steht danach nur nicht mehr zur Auswahl. Bestehende Belege bleiben unverändert.',
  nameMissing: 'Ohne Namen lässt sich der Lieferant nicht speichern.',
  lastNameMissing: 'Ohne Nachnamen lässt sich der Lieferant nicht speichern.',
  ownRoleLabel: 'Lieferant',
  ownRoleHint: 'Von dieser Firma wird eingekauft.',
  otherRoleLabel: 'Auch Kunde',
  otherRoleHint: 'Diese Firma kauft zusätzlich bei uns ein.',
  alsoBadge: 'Auch Kunde',
  addressPanelTitle: 'Adresse',
  addressPanelHint: 'Die Adresse, an die Bestellungen gehen.',
}

/**
 * The wording of one mask.
 *
 * @param role which of the two masks is open
 * @returns every text that mask needs
 */
export function wordingFor(role: PartnerRole): RoleWording {
  return role === 'supplier' ? SUPPLIER : CUSTOMER
}

/**
 * Whether a record holds one of the two roles.
 *
 * <p>Used for the badge that marks a customer who is also a supplier. Filtering the list is
 * the server's job: `role` combines with `search` and `activeOnly` there.
 *
 * @param partner the record, as far as its two flags are known
 * @param role the role to ask about
 * @returns true when the record holds it
 */
export function holdsRole(
  partner: { isCustomer?: boolean; isSupplier?: boolean },
  role: PartnerRole,
): boolean {
  return role === 'supplier' ? partner.isSupplier === true : partner.isCustomer === true
}
