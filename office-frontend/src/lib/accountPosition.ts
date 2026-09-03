/**
 * Which position of the minimum breakdown an account may appear under, and what the account
 * dialog therefore offers.
 *
 * <p>Its own file rather than three more exports in `accounting.ts`: this is the one rule of the
 * chart that exists **three times** — as `ck_accounting_account_position` in the database, as
 * `AccountingRules.positionAllowedFor` in the backend, and here. The two in the backend are the
 * barriers; this one is a convenience, so that nobody has to run into a refusal to learn that an
 * income account cannot appear under «Vorräte». `accountPosition.test.ts` holds all 234 pairs
 * against the same table `AccountingRulesTest` does, which is what keeps the three together
 * (backend ADR-0112).
 */
import { COMPUTED_POSITIONS, POSITION_PREFIXES } from './accounting'
import type { AccountType, CatalogueEntry } from './types'

/**
 * Whether an account of this type may be filed under this position.
 *
 * <p>The same 51 of 234 pairs the backend allows: `CLOSING` with `ABSCHLUSS`, `ASSET` with the
 * current and fixed assets, `LIABILITY` with the short and long term liabilities, `EQUITY` with
 * the equity, and income **and** expense with the profit and loss statement. That the last two
 * share their positions is no oversight: four positions name expense and income in one line
 * (OR Art. 959b Abs. 2 Ziff. 7-9), which is why the account carries a type of its own.
 *
 * @param accountType the type of the account
 * @param position the code of the position
 * @returns true for the allowed pairs, false for the rest and for a missing value on either side
 */
export function positionAllowedFor(accountType: AccountType, position: string): boolean {
  if (!accountType || !position) return false
  const prefixes = POSITION_PREFIXES[accountType]
  if (prefixes === undefined) return false
  return prefixes.some((prefix) => position.startsWith(prefix))
}

/**
 * Whether a position is computed from the others and therefore carries no account.
 *
 * @param position the code of the position
 * @returns true for the two computed ones
 */
export function isComputedPosition(position: string): boolean {
  return COMPUTED_POSITIONS.includes(position)
}

/**
 * The positions the account dialog offers for one account type.
 *
 * <p>Two filters, and they mean different things. **The type filter is convenience**: the
 * database refuses the pair anyway. **The filter on the computed positions is the friendly half
 * of a rule the application enforces**: `AccountingManagement.saveAccount` refuses them, the
 * database does not, and an option that can only ever be refused has no business in a dropdown.
 *
 * <p>What is deliberately **not** filtered is `visible`. A tenant may hide a catalogue value,
 * and OR Art. 959a Abs. 1 asks for the positions «einzeln und in der vorgegebenen Reihenfolge» —
 * a hidden position that no account can be filed under would leave a hole in the balance sheet
 * nobody could fill again.
 *
 * @param accountType the type the account carries
 * @param entries the catalogue `or-position` as the API returned it
 * @param stored the position the account already carries, so an existing value never disappears
 *   from its own dropdown — the same rule `selectOptions` follows for the maintained lists
 * @returns the options in the order they arrived, the stored one appended if it was filtered out
 */
export function positionOptionsFor(
  accountType: AccountType,
  entries: readonly CatalogueEntry[],
  stored?: string | null,
): CatalogueEntry[] {
  const offered = entries.filter(
    (entry) => positionAllowedFor(accountType, entry.code) && !isComputedPosition(entry.code),
  )
  if (!stored || offered.some((entry) => entry.code === stored)) return offered

  const known = entries.find((entry) => entry.code === stored)
  return [...offered, known ?? { code: stored, name: stored }]
}

/**
 * The question the position field asks, in plain words.
 *
 * <p>The field is never called «OR-Position»: a bookkeeper decides where an account is to
 * **appear**, and the enum name is of no help with that.
 *
 * @param accountType the type the account carries
 * @returns the question, ending in a colon
 */
export function positionQuestionFor(accountType: AccountType): string {
  if (accountType === 'REVENUE' || accountType === 'EXPENSE') {
    return 'Erscheint in der Erfolgsrechnung unter:'
  }
  // The closing account belongs to neither statement, so neither wording is true of it.
  if (accountType === 'CLOSING') return 'Erscheint im Abschluss unter:'
  return 'Erscheint in der Bilanz unter:'
}
