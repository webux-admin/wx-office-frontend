import type { ClosingCheck, ClosingPreview, FiscalYear, YearLogLine } from '../../lib/types'

/** The three steps of the closing wizard, in the order the run forces them into. */
export type ClosingStep = 'CHECKS' | 'ACCRUALS' | 'CARRY_FORWARD'

/** What each step is called and what it asks. */
export const CLOSING_STEPS: readonly { step: ClosingStep; title: string }[] = [
  { step: 'CHECKS', title: 'Prüfung' },
  { step: 'ACCRUALS', title: 'Abgrenzungen' },
  { step: 'CARRY_FORWARD', title: 'Vortrag' },
]

/**
 * Whether the wizard may go on from one step.
 *
 * <p><b>Step 1 is the gate and the other two are not.</b> Nine findings decide whether a close is
 * possible at all; the two steps after it collect answers the caller gives, and refusing to move
 * on because a box is unticked would leave somebody staring at a button with no sentence saying
 * why. The unticked box stops the run and not the walk, one step later and beside the sentence
 * that explains it — {@link accrualRefusal}.
 *
 * @param step where the wizard stands
 * @param preview what the run would do, absent while it is still being fetched
 * @returns whether «Weiter» does anything
 */
export function canContinue(step: ClosingStep, preview: ClosingPreview | undefined): boolean {
  if (preview === undefined) {
    return false
  }
  return step === 'CHECKS' ? !preview.blocked : true
}

/**
 * Why the run may not be started yet, or `undefined` where nothing is in the way.
 *
 * <p><b>The accrual confirmation is compulsory, and the screen says so before the click rather
 * than after it.</b> The run refuses without it — finding 2a, `ClosingChecks.checkAccrualsConfirmed`
 * — and the same screen already holds that rule for the other compulsory answer of the
 * bookkeeping: «Wieder öffnen» stays off while the reason is empty «rather than answering 400 to a
 * click somebody could have been spared» (`ReopenDialog`). Two compulsory answers on one screen,
 * enforced two different ways, would teach that one of them is optional.
 *
 * <p><b>It is not a gate on «Weiter».</b> The wizard walks all three steps with the box
 * untouched, because the tick is asked for in step 2 and the run happens after step 3 — #96 says
 * «Pflichtklick, keine Sperre», and that is the Sperre it means. What stops is the run, at the
 * moment the run is the next thing to happen, with the sentence beside the button.
 *
 * <p>The wording is the backend's, word for word: the message of finding 2a and its own note.
 * Two wordings for one rule would read as two different rules the first time somebody hits the
 * second one.
 *
 * @param accrualsConfirmed whether the box of OR Art. 958b Abs. 1 is ticked
 * @returns the sentence the run would refuse with, or `undefined` where it would run
 */
export function accrualRefusal(accrualsConfirmed: boolean): string | undefined {
  if (accrualsConfirmed) {
    return undefined
  }
  return (
    'Die Abgrenzungen sind nicht bestätigt. Der Abschluss verlangt die Bestätigung nach' +
    ' OR Art. 958b Abs. 1.'
  )
}

/**
 * The step after this one, or the same one at the end.
 *
 * @param step where the wizard stands
 * @returns where «Weiter» leads
 */
export function nextStep(step: ClosingStep): ClosingStep {
  const index = CLOSING_STEPS.findIndex((entry) => entry.step === step)
  return CLOSING_STEPS[Math.min(index + 1, CLOSING_STEPS.length - 1)].step
}

/**
 * The step before this one, or the same one at the start.
 *
 * @param step where the wizard stands
 * @returns where «Zurück» leads
 */
export function previousStep(step: ClosingStep): ClosingStep {
  const index = CLOSING_STEPS.findIndex((entry) => entry.step === step)
  return CLOSING_STEPS[Math.max(index - 1, 0)].step
}

/**
 * The findings, the ones that stop the run first.
 *
 * <p>A list of nine in which the one that matters sits seventh is a list nobody reads to the end.
 * Within each half the order of the run is kept, because that is the order the process document
 * and the printed checklist use.
 *
 * @param checks the nine findings
 * @returns the same nine, blocking failures first
 */
export function sortedChecks(checks: readonly ClosingCheck[]): ClosingCheck[] {
  const blocking = checks.filter((check) => check.blocking && !check.passed)
  const rest = checks.filter((check) => !(check.blocking && !check.passed))
  return [...blocking, ...rest]
}

/**
 * What a finding looks like in the list: a tick, a cross, or neither.
 *
 * <p>Three states and not two. The reconciliation against the sub-ledgers has its place, its
 * number and its note and no finding at all — a cross would claim something is wrong, and a tick
 * would claim something was checked. It is «offen», which is what it is.
 *
 * @param check one of the nine findings
 * @returns which of the three marks the row carries
 */
export function checkTone(check: ClosingCheck): 'passed' | 'blocked' | 'open' {
  if (check.passed) {
    return 'passed'
  }
  return check.blocking ? 'blocked' : 'open'
}

/**
 * The year the screen opens on: the one that is due to be closed.
 *
 * <p>The oldest year that is not closed yet — a bookkeeping is closed in order, and a screen
 * opening on the current year would ask somebody to close 2027 while 2026 still stands open.
 * Where every year is closed, the most recent one, so the summary of the last close is what a
 * visitor sees.
 *
 * @param years the fiscal years of the tenant
 * @returns the year to open on, or `undefined` where the tenant keeps none
 */
export function defaultClosingYear(years: readonly FiscalYear[]): FiscalYear | undefined {
  const byStart = [...years].sort((one, other) => one.startDate.localeCompare(other.startDate))
  return byStart.find((year) => year.status !== 'CLOSED') ?? byStart.at(-1)
}

/**
 * Whether a year offers the wizard at all.
 *
 * <p>A closed year shows what its close did and the way back out of it; an open or locked one
 * shows the wizard. `LOCKED` belongs on the wizard side and that is the whole point of the state:
 * a year is handed to the fiduciary locked precisely so it can be closed without anything moving
 * underneath.
 *
 * @param year the year on screen, absent while the list is still being fetched
 * @returns whether the three steps are shown rather than the summary
 */
export function showsWizard(year: FiscalYear | undefined): boolean {
  return year !== undefined && year.status !== 'CLOSED'
}

/**
 * Whether this close carries no result at all, and therefore needs no carry forward account.
 *
 * <p><b>The absent account is an answer, not a gap.</b> The backend names no account exactly
 * where it needs none: it resolves what the person picked, then what the tenant picked last
 * time, then the account carrying `GEWINNVORTRAG` — and skips that last try where there is
 * nothing to carry, because demanding an account there would refuse a close over a decision that
 * changes nothing (`ClosingManagement.carryAccountOf`). A dormant company whose year comes out
 * at nil is the ordinary case for it.
 *
 * <p><b>Only readable while nothing blocks.</b> The other way to an absent account is a missing
 * system key, and that one fails finding 5, the one about the system accounts
 * (`ClosingChecks.checkSystemAccounts`) — which is why this asks `blocked` first. Where
 * something blocks, the run stands at step 1 and the finding says what is missing; claiming
 * «nothing to carry» there would talk a person past a red cross.
 *
 * @param preview what the run would do
 * @returns whether the last step shows no account because none is needed
 */
export function carriesNoResult(preview: ClosingPreview): boolean {
  const account = preview.carryForwardAccount
  return !preview.blocked && (account === undefined || account === null || account === '')
}

/**
 * What the run is about to write, as one sentence for the last step.
 *
 * <p>Assembled here rather than in the markup so a test can read it: the sentence is the last
 * thing somebody sees before books are written, and it has to name the figure, the account and
 * the year that follows.
 *
 * <p><b>Where nothing is carried, no account is named — not even the one that was picked.</b>
 * The carry forward writes a line for the result only where there is one
 * (`CarryForward.of`), so «Der Gewinn wird auf Konto 2850 vorgetragen» beside a picked
 * account would describe a booking that does not happen. The balance sheet accounts move over
 * either way, and that half of the sentence stands unchanged.
 *
 * @param preview what the run would do
 * @param chosen the account the person picked in the dialog, empty while they have picked none.
 *   **Preferred over the backend's default**, because that is what the run will be sent — a
 *   sentence naming the default while a different account is about to be booked would be the one
 *   place a person could not have known.
 * @returns the sentence, ready to be shown
 */
export function closingSummarySentence(preview: ClosingPreview, chosen?: string): string {
  const following = preview.followingYear
  const yearPart = following.exists
    ? `in das bestehende Geschäftsjahr ${following.label}`
    : `in das neu angelegte Geschäftsjahr ${following.label}`
  const carriedPart = `${preview.carriedAccounts} Konten werden ${yearPart} übernommen.`
  if (carriesNoResult(preview)) {
    return `Es wird kein Ergebnis vorgetragen, und ${carriedPart}`
  }
  const kind = preview.expectedResult < 0 ? 'Verlust' : 'Gewinn'
  const target =
    chosen !== undefined && chosen !== '' ? chosen : (preview.carryForwardAccount ?? '—')
  return `Der ${kind} wird auf Konto ${target} vorgetragen, und ${carriedPart}`
}

/**
 * Whether the trail of a year already carries an accrual confirmation.
 *
 * <p>Shown on the summary of a closed year: the line says who declared that the accruals were
 * checked (OR Art. 958b Abs. 1), and a summary that left it out would hide the one statement of
 * the run that belongs to a person rather than to the machine.
 *
 * @param log the trail of the year
 * @returns the newest accrual line, or `undefined` where there is none
 */
export function accrualLineOf(log: readonly YearLogLine[]): YearLogLine | undefined {
  return log.find((line) => line.event === 'ACCRUALS')
}

/**
 * Whether the last step asks where the result goes, or only shows it.
 *
 * <p><b>A company is never asked.</b> Its result is carried onto «Gewinnvortrag oder
 * Verlustvortrag», which follows from the layout of its equity and not from the habits of the
 * house — the backend therefore offers no options at all for it. A question with one possible
 * answer is a question that teaches people to click past questions.
 *
 * <p>A tenant whose chart holds no capital and no private account is not asked either: there
 * would be nothing to pick, and what is missing is said by the findings of the first step rather
 * than by an empty picker.
 *
 * @param preview what the run would do
 * @returns whether the picker is shown instead of a fixed line
 */
export function asksCarryForward(preview: ClosingPreview): boolean {
  return preview.equityLayout !== 'JURISTIC' && preview.carryForwardOptions.length > 0
}

/**
 * What is said beside a carry forward account that is given rather than picked.
 *
 * <p>Three reasons lead to the same fixed line and none of them is the same news: this close
 * carries nothing, or the account is settled because the tenant is a company, or the chart holds
 * no account that could carry it. Saying «steht fest» about a chart that holds no capital
 * account would send somebody looking for a decision that nobody has to make.
 *
 * <p><b>«Nothing to carry» is asked first, and for a company as well.</b> Its sentence about the
 * settled account promises that the run books onto it — which is exactly what a close with no
 * result does not do.
 *
 * @param preview what the run would do
 * @returns the sentence under the fixed account, ready to be shown
 */
export function carryForwardHint(preview: ClosingPreview): string {
  if (carriesNoResult(preview)) {
    return (
      'Ein Vortragskonto braucht es nur für ein Ergebnis, und dieses Jahr trägt keines vor:' +
      ' nach den Abschlussbuchungen steht auf dem Konto für das Jahresergebnis in der Bilanz' +
      ' 0.00. Das ist kein Fehler und hält den Abschluss nicht auf.'
    )
  }
  if (preview.equityLayout === 'JURISTIC') {
    return (
      'Bei einer AG oder GmbH steht das Vortragskonto fest: der Gewinn- oder Verlustvortrag.' +
      ' Der Lauf belegt es vor, dieser Schritt zeigt es nur an.'
    )
  }
  return (
    'Der Kontenplan dieses Mandanten führt kein Kapital- und kein Privatkonto, das den Vortrag' +
    ' tragen könnte. Was fehlt, sagt die Prüfung im ersten Schritt.'
  )
}

/**
 * The sentence about the appropriation of the result, chosen by the equity layout.
 *
 * <p><b>Never a booking, in either case.</b> A dividend or a reserve is a resolution of the
 * general meeting (OR Art. 698 Abs. 2 Ziff. 4). A sole proprietorship and a partnership hold no
 * such meeting at all — their result is settled over the capital and private accounts.
 *
 * <p><b>Two sentences, and the second one is written for both of the other layouts.</b> #96
 * assigns it to them in as many words — «für Einzelunternehmen und Personengesellschaften sagt
 * er den anderen Satz» — and both sentences stand here in the wording of the issue.
 *
 * <p>Where no layout is chosen the second one stands. The step is not reachable in that state —
 * the missing chart blocks the run in step 1 — and of the two it is the one that promises
 * nothing.
 *
 * @param preview what the run would do
 * @returns the sentence, ready to be shown
 */
export function appropriationSentence(preview: ClosingPreview): string {
  if (preview.equityLayout === 'JURISTIC') {
    return (
      'Die Gewinnverwendung wird nicht gebucht. Über die Verwendung des Bilanzgewinns' +
      ' beschliesst die Generalversammlung (OR Art. 698 Abs. 2 Ziff. 4); die Buchung 2970 an' +
      ' 2269 erfassen Sie danach von Hand.'
    )
  }
  return (
    'Die Gewinnverwendung wird nicht gebucht. Bei einem Einzelunternehmen gibt es keinen' +
    ' Gewinnverwendungsbeschluss — der Saldo wird über die Kapital- und Privatkonten' +
    ' verrechnet.'
  )
}

/**
 * The later fiscal year that stands in the way of reopening this one.
 *
 * <p><b>Every later year has to stand open, not only the one that follows.</b> The counter
 * entries of a reopening land in this year and in the one after it; a year further out that is
 * closed or locked would take the next close with it. The earliest one in the way is the one to
 * name — it is where the person has to go first, and the cascade is deliberately not automated.
 *
 * @param years the fiscal years of the tenant
 * @param year the closed year somebody wants to open again
 * @returns the earliest later year that is not open, or `undefined` where the way is clear
 */
export function blockingLaterYear(
  years: readonly FiscalYear[],
  year: FiscalYear,
): FiscalYear | undefined {
  return [...years]
    .filter((candidate) => candidate.startDate > year.endDate)
    .sort((one, other) => one.startDate.localeCompare(other.startDate))
    .find((candidate) => candidate.status !== 'OPEN')
}

/**
 * Why a year cannot be opened again yet, in the words the backend refuses with.
 *
 * <p>Word for word the same sentence on both sides. The screen says it before the click and the
 * backend after it, and two wordings for one rule would read as two different rules the first
 * time somebody hits the second one.
 *
 * @param blocking the later year in the way
 * @param year the year somebody wants to open again
 * @returns the sentence, ready to be shown
 */
export function laterYearSentence(blocking: FiscalYear, year: FiscalYear): string {
  const state = blocking.status === 'CLOSED' ? 'abgeschlossen' : 'gesperrt'
  return (
    `Das Geschäftsjahr ${blocking.label} ist ${state}.` +
    ` Öffnen Sie zuerst ${blocking.label}, dann ${year.label}.`
  )
}
