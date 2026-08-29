import type { MasterDataList } from './types'

/**
 * One maintained selection list, as a screen of its own.
 *
 * <p>The lists used to sit behind eight tabs on one screen called «Auswahllisten», and three
 * more were about to join them. Nobody looking for units guesses that word, so each list is
 * its own route under `/basisdaten` and its own entry in the menu.
 */
export type BasicDataList = {
  /** Path segment under `/basisdaten`, German like every other path. */
  slug: string
  /** The list as the API serves it, which is also its path segment there. */
  list: MasterDataList
  /** Heading of the screen and wording in the menu. */
  label: string
  /** One sentence saying what the list steers, shown under the heading. */
  description: string
}

/**
 * The maintained lists, in the order the menu offers them.
 *
 * <p>What is needed daily stands at the top; what is set up once and then left alone follows.
 * The tax rates are not here — they are federal, carry no tenant and have no write endpoint,
 * so they keep their own screen.
 */
export const BASIC_DATA_LISTS: BasicDataList[] = [
  {
    slug: 'zahlungsarten',
    list: 'payment-methods',
    label: 'Zahlungsarten',
    description: 'Wie eine Rechnung beglichen wird. Wann sie fällig ist, sagt die Verkaufskondition.',
  },
  {
    slug: 'mahnarten',
    list: 'dunning-types',
    label: 'Mahnarten',
    description:
      'Die Bezeichnungen der Mahnstufen, von der Erinnerung bis zur Betreibungsandrohung. ' +
      'Fristen, Gebühren und Texte stehen im Mahnwesen.',
  },
  {
    slug: 'mahnstopp-gruende',
    list: 'dunning-block-reasons',
    label: 'Mahnstopp-Gründe',
    description:
      'Warum ein Kunde oder ein Beleg nicht gemahnt wird. Ein Katalog und kein Freitext: ' +
      '«zahlt nie» wäre ein Bonitätsurteil über eine Person.',
  },
  {
    slug: 'einheiten',
    list: 'units',
    label: 'Einheiten',
    description: 'Worin ein Produkt verkauft wird. Die Kurzform steht auf der Belegzeile.',
  },
  {
    slug: 'waehrungen',
    list: 'currencies',
    label: 'Währungen',
    description: 'Währungen, in denen Belege ausgestellt werden können.',
  },
  {
    slug: 'verrechnungsarten',
    list: 'billing-types',
    label: 'Verrechnungsarten',
    description: 'Wie eine Leistung verrechnet wird: nach Aufwand, pauschal oder gar nicht.',
  },
  {
    slug: 'sprachen',
    list: 'languages',
    label: 'Sprachen',
    description: 'Korrespondenzsprachen. Der Code ist das Sprachkürzel, zum Beispiel de.',
  },
  {
    slug: 'laender',
    list: 'countries',
    label: 'Länder',
    description: 'Länder einer Adresse. Der Code ist das Kürzel nach ISO, zum Beispiel CH.',
  },
  {
    slug: 'rechtsformen',
    list: 'legal-forms',
    label: 'Rechtsformen',
    description: 'Die Rechtsform einer Firma, bei Kunden, Lieferanten und beim Mandanten.',
  },
  {
    slug: 'anreden',
    list: 'salutations',
    label: 'Anreden',
    description: 'Wie eine Person angeschrieben wird.',
  },
  {
    slug: 'ertragskonten',
    list: 'revenue-accounts',
    label: 'Ertragskonten',
    description: 'Konten, auf die eine Belegzeile gebucht wird. Der Code ist die Kontonummer.',
  },
]

/**
 * Looks up a list by the path segment in the address.
 *
 * @param slug the segment after `/basisdaten`, missing when the address stops there
 * @returns the list, or undefined for a segment no list is served under
 */
export function basicDataFor(slug: string | undefined): BasicDataList | undefined {
  return BASIC_DATA_LISTS.find((entry) => entry.slug === slug)
}

/** The list the menu opens first, for an address that names none. */
export function firstBasicDataPath(): string {
  return `/basisdaten/${BASIC_DATA_LISTS[0].slug}`
}
