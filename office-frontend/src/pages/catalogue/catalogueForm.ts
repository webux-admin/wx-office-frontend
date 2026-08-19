import { labelForm } from '../../lib/masterData'
import type { CatalogueEntry, CatalogueName } from '../../lib/types'

/**
 * How one fixed value is presented, while it is being changed.
 *
 * <p>Its own module because the screen and the dialog share it: the screen holds the form, the
 * dialog only shows it. The code and the position are missing on purpose — the code is fixed in
 * the application, and the position is moved with the arrows in the table.
 */
export type CatalogueForm = {
  /** The German wording, which goes out as the name and as the default translation. */
  name: string
  shortName: string
  visible: boolean
  /** The other document languages, by language code, without the default one. */
  translations: Record<string, string>
}

/** How long the backend lets a wording be; longer is refused as a bare 500. */
const NAME_LIMIT = 60

/** How long the backend lets a short form be; longer is refused as a bare 500. */
const SHORT_NAME_LIMIT = 10

/** The spacing of the delivered positions (100, 200, 300 …), used where one is missing. */
const POSITION_STEP = 100

/**
 * The nine catalogues, in the order they are offered.
 *
 * <p>They hold the values the application steers itself by: the state model of a document, the
 * VAT return, which fields a record must carry. Which values exist is therefore decided in the
 * backend code and nowhere else — a tenant only decides how they are named, sorted and whether
 * they are still offered.
 */
export const CATALOGUES: { name: CatalogueName; title: string; description: string }[] = [
  {
    name: 'partner-type',
    title: 'Art des Eintrags',
    description:
      'Firma oder Privatperson. Entscheidet, welche Felder ein Kunde oder Lieferant braucht.',
  },
  {
    name: 'address-usage',
    title: 'Verwendung einer Adresse',
    description: 'Für welche Belegart eine Adresse gilt.',
  },
  {
    name: 'product-type',
    title: 'Art eines Produkts',
    description: 'Ware oder Dienstleistung. Entscheidet, wie das Leistungsdatum gelesen wird.',
  },
  {
    name: 'vat-category',
    title: 'MwSt-Behandlung',
    description:
      'Welcher Satz auf eine Zeile angewendet wird. Die Sätze selbst sind eidgenössisch und stehen unter Mehrwertsteuer.',
  },
  {
    name: 'vat-method',
    title: 'Abrechnungsmethode',
    description: 'Effektiv oder Saldosteuersatz. Steht in den Einstellungen des Mandanten.',
  },
  {
    name: 'reference-type',
    title: 'Referenzart',
    description:
      'Welche Referenz ein Einzahlungsschein trägt. Von ISO 20022 und der QR-Rechnung vorgegeben.',
  },
  {
    name: 'price-origin',
    title: 'Herkunft eines Preises',
    description: 'Woher der Preis einer Zeile kommt: Kundenpreis, Preisgruppe oder Grundpreis.',
  },
  {
    name: 'document-category',
    title: 'Belegkategorie',
    description: 'Offerte, Auftrag, Lieferschein, Rechnung, Gutschrift.',
  },
  {
    name: 'document-status',
    title: 'Belegstatus',
    description:
      'Entwurf, ausgestellt, storniert. Ein Zustandsmodell — deshalb kommt kein Wert dazu.',
  },
]

/**
 * Fills the form from the value as it is served today.
 *
 * <p>What arrives is the merged view: what the application delivers, with whatever the tenant
 * changed on top. That is what the mask shows, because it is what everybody else sees too.
 *
 * <p>The wording shown is the one for the tenant's own language, not `name`: the application
 * delivers every value with a German `name` regardless of which language a tenant works in, so
 * a tenant on French would otherwise be shown the German word and overwrite its French label
 * with it on the next save. `name` is only the fallback for a language without a translation.
 *
 * @param entry the value as the API returned it
 * @param defaultLanguage code of the tenant's default language, empty when it is unknown
 * @returns the form, with every missing field as an empty string
 */
export function toCatalogueForm(entry: CatalogueEntry, defaultLanguage: string): CatalogueForm {
  return {
    name: entry.labels?.[defaultLanguage] ?? entry.name,
    shortName: entry.shortName ?? '',
    visible: entry.visible !== false,
    translations: labelForm(entry.labels, defaultLanguage),
  }
}

/**
 * Turns the form into the payload of `PUT /api/tenants/{id}/catalogues/{name}/{code}`.
 *
 * <p>The endpoint replaces rather than patches: a field left out falls back to the wording the
 * application delivers, and a `labels` map left out drops every stored translation. The
 * complete state therefore goes out on every save, the empty short form included — an empty
 * string is how a short form is removed, while leaving it out would bring the delivered one
 * back.
 *
 * <p>The position comes from the stored value and never from the form: it is changed with the
 * arrows in the table, see {@link reorderPayload}.
 *
 * @param form the filled in dialog
 * @param entry the value as it is served today, for the code and the position
 * @param labels the whole translation map to store, `undefined` for none at all
 * @returns the value as the API wants it
 */
export function toCataloguePayload(
  form: CatalogueForm,
  entry: CatalogueEntry,
  labels: Record<string, string> | undefined,
): CatalogueEntry {
  return {
    code: entry.code,
    // The same German text goes out twice: the backend holds `name` and the translation in the
    // default language apart and keeps neither in sync with the other, so a wording written
    // into only one of them would leave tables and dropdowns disagreeing. `labels` carries it
    // under the default language, this line as the name.
    name: form.name.trim(),
    labels,
    shortName: form.shortName.trim(),
    sortOrder: entry.sortOrder,
    visible: form.visible,
  }
}

/**
 * Checks the dialog before it is sent.
 *
 * <p>This mask has to check itself: the exception handler of the backend does not cover this
 * controller, so a wording that is too long, a blank translation, an unknown language key and a
 * concurrent change all come back as a bare HTTP 500 with no sentence worth showing. Every
 * limit checked here is one of the backend, not a rule of this frontend.
 *
 * <p>The position is not checked because the form carries none; {@link reorderPayload} keeps it
 * a whole number of at least zero.
 *
 * @param form the filled in dialog
 * @returns the first German complaint, or `null` when nothing is obviously wrong
 */
export function catalogueComplaint(form: CatalogueForm): string | null {
  const name = form.name.trim()
  if (name === '') {
    return 'Ein fester Wert braucht eine Bezeichnung. Zum ausgelieferten Text führt «Zurücksetzen».'
  }
  if (name.length > NAME_LIMIT) {
    return `Die Bezeichnung darf höchstens ${NAME_LIMIT} Zeichen lang sein.`
  }
  if (form.shortName.trim().length > SHORT_NAME_LIMIT) {
    return `Die Kurzform darf höchstens ${SHORT_NAME_LIMIT} Zeichen lang sein.`
  }
  for (const label of Object.values(form.translations)) {
    // A field left completely empty means "no translation in this language" and is allowed; one
    // holding only spaces looks filled but is not, and the backend refuses it.
    if (label !== '' && label.trim() === '') {
      return 'Eine Übersetzung darf nicht nur aus Leerzeichen bestehen. Lass das Feld leer, wenn keine gebraucht wird.'
    }
    if (label.trim().length > NAME_LIMIT) {
      return `Eine Übersetzung darf höchstens ${NAME_LIMIT} Zeichen lang sein.`
    }
  }
  return null
}

/**
 * Moves one value past its neighbour, as the payloads that brings about.
 *
 * <p>There is no endpoint for a whole order, so a move means swapping the two positions and
 * writing both rows back. The delivered positions are neither unique nor contiguous, so two
 * rows can share one: swapping would then change nothing, and instead the moved row takes a
 * position one apart from its neighbour. A row without a position at all is counted at the
 * spacing the application delivers.
 *
 * <p>Every returned value is complete and ready to be sent as it is: the endpoint replaces what
 * it is given, so a payload of nothing but a position would drop the wording around it.
 *
 * @param entries the values of one catalogue, in the order they are shown
 * @param index the row that is moving
 * @param direction -1 for one row up, 1 for one row down
 * @returns the values whose position changed, usually two; empty when the move is impossible
 */
export function reorderPayload(
  entries: CatalogueEntry[],
  index: number,
  direction: -1 | 1,
): CatalogueEntry[] {
  const target = index + direction
  if (index < 0 || index >= entries.length) return []
  if (target < 0 || target >= entries.length) return []

  const moved = entries[index]
  const neighbour = entries[target]
  const movedPosition = positionOf(entries, index)
  const neighbourPosition = positionOf(entries, target)

  if (movedPosition !== neighbourPosition) {
    return [
      { ...moved, sortOrder: neighbourPosition },
      { ...neighbour, sortOrder: movedPosition },
    ]
  }
  // Both rows sit on the same position, so one of them has to leave it. Downwards, and upwards
  // from anything but zero, the moved row steps aside; at zero it cannot, because a negative
  // position is refused, so the neighbour steps down instead.
  if (direction === 1) return [{ ...moved, sortOrder: movedPosition + 1 }]
  if (movedPosition > 0) return [{ ...moved, sortOrder: movedPosition - 1 }]
  return [{ ...neighbour, sortOrder: neighbourPosition + 1 }]
}

/** The position of one row, standing in for a missing one at the delivered spacing. */
function positionOf(entries: CatalogueEntry[], index: number): number {
  return entries[index].sortOrder ?? (index + 1) * POSITION_STEP
}
