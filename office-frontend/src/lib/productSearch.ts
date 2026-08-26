/**
 * What a hit of the catalogue search matched, seen from the row that shows it.
 *
 * <p>The search runs over number, name and bar code at once (ADR-0072 of the backend), and
 * no list shows a bar code — so a row can stand there without a single visible field that
 * has anything to do with what was typed or scanned.
 */

/**
 * Whether the bar code is the only thing that put a product on screen.
 *
 * <p>A scanned article otherwise arrives as a row whose every visible field is unrelated to
 * what was read, and nobody can tell whether the right article was found. Where the name or
 * the number already carries the term, the row explains itself and the code stays out of the
 * way.
 *
 * <p>Takes the term the way the server matched it: anywhere in the text, without regard to
 * case. Only the columns the search really covers are looked at, so nothing is claimed about
 * a hit that came from somewhere else.
 *
 * @param product the row on screen, as far as the searched columns go
 * @param term the term the list was asked for, already trimmed
 * @returns true where only the bar code matched
 */
export function onlyBarCodeMatched(
  product: { name: string; productNumber?: string; eanCode?: string },
  term: string,
): boolean {
  if (term === '' || product.eanCode === undefined) return false
  if (carries(product.name, term) || carries(product.productNumber ?? '', term)) return false
  return carries(product.eanCode, term)
}

/** True where a text carries the term the way the search matched it: any part, any case. */
function carries(text: string, term: string): boolean {
  return text.toLowerCase().includes(term.toLowerCase())
}
