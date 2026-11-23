/**
 * The time tracking module: its name, its address and its rights.
 *
 * <p>Its own building block, like `project.ts`: the menu entry, the screens and the role mask
 * read the same codes, and a right spelled out twice is a right that drifts in one of them.
 * Recording time comes with the next stage; what stands is the switch and the four rights
 * (backend ADR-0159).
 */

/** Name of the backend `LicensedModule` value. */
export const TIMETRACKING_MODULE = 'TIMETRACKING'

/** Path of «Meine Zeiten» within the application. */
export const TIMETRACKING_PATH = '/zeiten'

/**
 * The four rights of the module.
 *
 * <p>One's own times come with `track`, without any other right. `read` opens the times of
 * everybody and `write` those of others — personal data about how somebody works (OR Art.
 * 328b). `bill` writes an invoice draft and works only together with `INVOICE_WRITE`.
 */
export const TIMETRACKING_RIGHTS = {
  track: 'TIME_TRACK',
  read: 'TIME_READ',
  write: 'TIME_WRITE',
  bill: 'TIME_BILL',
} as const
