import { describe, expect, it } from 'vitest'
import type {
  ArchivedReport,
  ClosingCheck,
  ClosingPreview,
  FiscalYear,
  YearLogLine,
} from '../../lib/types'
import {
  accrualLineOf,
  accrualRefusal,
  appropriationSentence,
  asksCarryForward,
  blockingLaterYear,
  canContinue,
  carriesNoResult,
  carryForwardHint,
  checkTone,
  CLOSING_STEPS,
  closingRunsOf,
  closingSummarySentence,
  defaultClosingYear,
  filedPapersSentence,
  laterYearSentence,
  nextStep,
  previousStep,
  showsWizard,
  sortedChecks,
} from './closingWizard'

/**
 * The rules of the closing wizard, without a screen.
 *
 * <p>What is checked here is the part a screen test could only get at through three clicks: which
 * step follows which, when «Weiter» does anything, how ten findings are ordered so the one that
 * stops the run is read first, and how the filed papers of a year fall into its closing runs.
 */
describe('closingWizard', () => {
  describe('canContinue', () => {
    it('canContinueTest', () => {
      expect(canContinue('CHECKS', preview())).toBe(true)
      expect(canContinue('ACCRUALS', preview())).toBe(true)
      expect(canContinue('CARRY_FORWARD', preview())).toBe(true)
    })

    /** Step 1 is the gate: ten findings decide whether a close is possible at all. */
    it('canContinueWithABlockingCheckTest', () => {
      const blocked = { ...preview(), blocked: true }

      expect(canContinue('CHECKS', blocked)).toBe(false)
    })

    /**
     * <b>And the two steps after it are not gates.</b> Refusing to move on because a box is
     * unticked would leave somebody staring at a button with no sentence saying why; the unticked
     * box is refused at the end, where the run says what is missing.
     */
    it('canContinueOnTheLaterStepsWithABlockingCheckTest', () => {
      const blocked = { ...preview(), blocked: true }

      expect(canContinue('ACCRUALS', blocked)).toBe(true)
      expect(canContinue('CARRY_FORWARD', blocked)).toBe(true)
    })

    /** Nothing goes on while the preview is still on its way. */
    it('canContinueWithoutAPreviewTest', () => {
      expect(canContinue('CHECKS', undefined)).toBe(false)
      expect(canContinue('ACCRUALS', undefined)).toBe(false)
    })

    /**
     * <b>The accrual tick stops the run and not the walk, and the two answers are made here in
     * one breath.</b>
     *
     * <p>The tick reaches `canContinue` in no argument at all — «Weiter» never becomes a second
     * gate, which would leave somebody staring at a dead button one step before the sentence
     * that explains it. What refuses is the run, and `accrualRefusal` says so on the same
     * unticked state. Both halves stand in one test on purpose: apart, the first half is
     * `canContinueTest` written twice, and the pair is the rule. The screen end of it is
     * `ClosingPage.closingPageKeepsTheRunOffWithoutTheAccrualConfirmationTest`.
     */
    it('canContinueWithoutTheAccrualConfirmationTest', () => {
      expect(canContinue('ACCRUALS', preview())).toBe(true)
      expect(canContinue('CARRY_FORWARD', preview())).toBe(true)
      expect(accrualRefusal(false)).toBeDefined()
      expect(accrualRefusal(true)).toBeUndefined()
    })
  })

  describe('accrualRefusal', () => {
    /**
     * <b>The compulsory click of OR Art. 958b Abs. 1, said before the click rather than after
     * it.</b> The sentence is the backend's word for word — the message of finding 2a and its
     * own note (`ClosingChecks.checkAccrualsConfirmed`) — because two wordings for one rule read
     * as two rules the first time somebody hits the second one.
     */
    it('accrualRefusalTest', () => {
      expect(accrualRefusal(false)).toBe(
        'Die Abgrenzungen sind nicht bestätigt. Der Abschluss verlangt die Bestätigung nach' +
          ' OR Art. 958b Abs. 1.',
      )
    })

    /** Ticked: nothing is in the way, and the run button carries its ordinary tooltip again. */
    it('accrualRefusalWithTheConfirmationTest', () => {
      expect(accrualRefusal(true)).toBeUndefined()
    })
  })

  describe('nextStep and previousStep', () => {
    it('nextStepTest', () => {
      expect(nextStep('CHECKS')).toBe('ACCRUALS')
      expect(nextStep('ACCRUALS')).toBe('CARRY_FORWARD')
    })

    /** The last step stays where it is: what follows it is the run, not a fourth step. */
    it('nextStepAtTheEndTest', () => {
      expect(nextStep('CARRY_FORWARD')).toBe('CARRY_FORWARD')
    })

    it('previousStepTest', () => {
      expect(previousStep('CARRY_FORWARD')).toBe('ACCRUALS')
      expect(previousStep('ACCRUALS')).toBe('CHECKS')
    })

    /** And the first stays where it is: «Zurück» is not shown there at all. */
    it('previousStepAtTheStartTest', () => {
      expect(previousStep('CHECKS')).toBe('CHECKS')
    })

    /** Three steps, and the two functions walk exactly them. */
    it('closingStepsCoverTheWizardTest', () => {
      expect(CLOSING_STEPS.map((entry) => entry.step)).toEqual([
        'CHECKS',
        'ACCRUALS',
        'CARRY_FORWARD',
      ])
      expect(CLOSING_STEPS.map((entry) => entry.title)).toEqual([
        'Prüfung',
        'Abgrenzungen',
        'Vortrag',
      ])
    })
  })

  describe('sortedChecks', () => {
    /** What stops the run stands first; within each half the order of the run is kept. */
    it('sortedChecksTest', () => {
      const sorted = sortedChecks([
        passed('1'),
        failed('2'),
        passed('2a'),
        pending('3a'),
        failed('5'),
      ])

      expect(sorted.map((check) => check.step)).toEqual(['2', '5', '1', '2a', '3a'])
    })

    /**
     * <b>The ten of the run, in the shape the screen really gets them, and the sorting has
     * something to do.</b> Finding 3a is the one that never blocks and finding 5 the one that is
     * red here, so the list that comes back is not the list that went in: the red one is lifted
     * to the top and everything else keeps the order of the run — 1, 2, 2a, 3, 3a, 4, 4a, 7, 7a,
     * the order of `ClosingChecks.of` minus the one that moved.
     *
     * <p><b>Ten in, ten out.</b> The sorting drops nothing and invents nothing; the backend
     * always answers ten (`ClosingChecks.of`, «always ten and always in this order» — 4a since
     * #97, decision A), and a screen showing one fewer would hide a finding rather than order
     * it. The mask end of it is `ClosingPage.closingPageShowsTheTenChecksTest`.
     */
    it('sortedChecksOfTheTenTest', () => {
      const ten = [
        passed('1'),
        passed('2'),
        passed('2a'),
        passed('3'),
        pending('3a'),
        passed('4'),
        passed('4a'),
        failed('5'),
        passed('7'),
        passed('7a'),
      ]

      const sorted = sortedChecks(ten)

      expect(sorted).toHaveLength(10)
      expect(sorted.map((check) => check.step)).toEqual([
        '5',
        '1',
        '2',
        '2a',
        '3',
        '3a',
        '4',
        '4a',
        '7',
        '7a',
      ])
    })

    /**
     * Ten that all hold keep the order of the run exactly — the ordinary case, in which nothing
     * moves at all. It is the counter-probe to `sortedChecksOfTheTenTest`: where nothing blocks,
     * the list has to come back the way the run wrote it and not sorted by anything else.
     */
    it('sortedChecksWithoutAFailureTest', () => {
      const steps = ['1', '2', '2a', '3', '3a', '4', '4a', '5', '7', '7a']

      const sorted = sortedChecks(steps.map((step) => passed(step)))

      expect(sorted).toHaveLength(10)
      expect(sorted.map((check) => check.step)).toEqual(steps)
    })

    /** An empty list is an empty list, and no screen has to guard against it. */
    it('sortedChecksOfNothingTest', () => {
      expect(sortedChecks([])).toEqual([])
    })
  })

  describe('closingRunsOf', () => {
    /**
     * <b>Two closes, two runs, nothing overwritten.</b> The archive lists newest first — the
     * second run, then a paper filed by hand, then the first run, each run in reverse drawing
     * order. What comes back is the two runs, the newer one first and each in the order its
     * papers were drawn (ascending by id), and the paper filed by hand is in neither: it is not
     * what a close did.
     */
    it('closingRunsOfTest', () => {
      const archive = [
        ...filed(2, 31).reverse(),
        paper({ id: 29, origin: 'MANUAL', closingNumber: null, asOfDate: '2026-06-30' }),
        ...filed(1, 21).reverse(),
      ]

      const runs = closingRunsOf(archive)

      expect(runs.map((run) => run.closingNumber)).toEqual([2, 1])
      expect(runs[0].papers.map((entry) => entry.id)).toEqual([31, 32, 33, 34, 35])
      expect(runs[1].papers.map((entry) => entry.id)).toEqual([21, 22, 23, 24, 25])
      expect(runs[0].papers.map((entry) => entry.report)).toEqual([
        'journal',
        'account-sheets',
        'trial-balance',
        'balance-sheet',
        'income-statement',
      ])
      expect(runs.flatMap((run) => run.papers).some((entry) => entry.id === 29)).toBe(false)
    })

    /** One close is one run, with its five under the number 1. */
    it('closingRunsOfWithOneRunTest', () => {
      const runs = closingRunsOf(filed(1, 21).reverse())

      expect(runs).toHaveLength(1)
      expect(runs[0].closingNumber).toBe(1)
      expect(runs[0].papers).toHaveLength(5)
    })

    /** Nothing filed, or only papers filed by hand: no run, and no screen has to guard it. */
    it('closingRunsOfWithoutAClosingPaperTest', () => {
      expect(closingRunsOf([])).toEqual([])
      expect(
        closingRunsOf([paper({ id: 29, origin: 'MANUAL', closingNumber: null })]),
      ).toEqual([])
    })

    /**
     * A run of one paper is still a run: the list answers what the archive holds and never
     * pretends that five stand where one does. The database refuses a closing paper without a
     * number; one that arrived all the same is left out rather than filed under a run of its own.
     */
    it('closingRunsOfWithAnIncompleteRunTest', () => {
      const runs = closingRunsOf([
        paper({ id: 40, closingNumber: 3 }),
        paper({ id: 41, closingNumber: null }),
      ])

      expect(runs).toEqual([{ closingNumber: 3, papers: [paper({ id: 40, closingNumber: 3 })] }])
    })
  })

  describe('filedPapersSentence', () => {
    /**
     * The five papers by their screen names, in the order the run draws them, and the two facts
     * the person is owed before the click: nothing filed can be changed or removed, and a paper
     * that cannot be laid out fails the whole close (backend ADR-0125).
     */
    it('filedPapersSentenceTest', () => {
      expect(filedPapersSentence()).toBe(
        'Der Abschluss legt 5 Papiere als PDF im Archiv ab — Journal, Kontoblätter,' +
          ' Saldenliste, Bilanz und Erfolgsrechnung — in der gesetzlichen Darstellung und in' +
          ' der Sprache des Mandanten. Sie lassen sich danach weder ändern noch löschen. Kann' +
          ' eines davon nicht gezeichnet werden, scheitert der ganze Abschluss, und es wird' +
          ' nichts gebucht.',
      )
    })
  })

  describe('checkTone', () => {
    /**
     * Three states and not two. The reconciliation against the sub-ledgers has its place, its
     * number and its note and no finding — a cross would claim something is wrong, and a tick
     * would claim something was checked.
     */
    it('checkToneTest', () => {
      expect(checkTone(passed('1'))).toBe('passed')
      expect(checkTone(failed('2'))).toBe('blocked')
      expect(checkTone(pending('3a'))).toBe('open')
    })
  })

  describe('defaultClosingYear', () => {
    /** The oldest year that is not closed: a bookkeeping is closed in order. */
    it('defaultClosingYearTest', () => {
      const chosen = defaultClosingYear([
        year(3, '2028', '2028-01-01', 'OPEN'),
        year(1, '2026', '2026-01-01', 'CLOSED'),
        year(2, '2027', '2027-01-01', 'OPEN'),
      ])

      expect(chosen?.label).toBe('2027')
    })

    /** A locked year is due to be closed, not skipped: that is what the state is for. */
    it('defaultClosingYearWithALockedYearTest', () => {
      const chosen = defaultClosingYear([
        year(1, '2026', '2026-01-01', 'CLOSED'),
        year(2, '2027', '2027-01-01', 'LOCKED'),
      ])

      expect(chosen?.label).toBe('2027')
    })

    /** Everything closed: the most recent one, so the last close is what a visitor sees. */
    it('defaultClosingYearWithEverythingClosedTest', () => {
      const chosen = defaultClosingYear([
        year(1, '2026', '2026-01-01', 'CLOSED'),
        year(2, '2027', '2027-01-01', 'CLOSED'),
      ])

      expect(chosen?.label).toBe('2027')
    })

    /** A tenant without a fiscal year gets an empty state and no crash. */
    it('defaultClosingYearWithoutYearsTest', () => {
      expect(defaultClosingYear([])).toBeUndefined()
    })
  })

  describe('showsWizard', () => {
    /** `LOCKED` belongs on the wizard side, and that is the whole point of the state. */
    it('showsWizardTest', () => {
      expect(showsWizard(year(1, '2026', '2026-01-01', 'OPEN'))).toBe(true)
      expect(showsWizard(year(1, '2026', '2026-01-01', 'LOCKED'))).toBe(true)
      expect(showsWizard(year(1, '2026', '2026-01-01', 'CLOSED'))).toBe(false)
      expect(showsWizard(undefined)).toBe(false)
    })
  })

  describe('carriesNoResult', () => {
    /**
     * <b>The absent account is an answer, not a gap.</b> A year that comes out at nil needs no
     * carry forward account, and the backend leaves the field empty for exactly that reason: it
     * skips the last of its three tries where there is nothing to carry
     * (`ClosingManagement.carryAccountOf`), and finding 5 lets that case through
     * (`ClosingChecks.checkSystemAccounts`, which demands the account only for a result other
     * than nil). The fixture therefore carries the nil as well — a missing account beside a
     * profit of 38’214.90 is a state the backend cannot produce.
     */
    it('carriesNoResultTest', () => {
      expect(carriesNoResult(nothingToCarry())).toBe(true)
    })

    /** An account named is an account to carry onto, and there is something to carry. */
    it('carriesNoResultWithAnAccountTest', () => {
      expect(carriesNoResult(preview())).toBe(false)
    })

    /**
     * <b>The other way to a missing account is a blocking finding, and it reads as one.</b> An
     * unassigned system key leaves the field empty too, and finding 5 then stops the run — which
     * is the state built here: a profit, no account, blocked. «Es ist nichts vorzutragen» would
     * talk somebody past a red cross.
     */
    it('carriesNoResultWithABlockingFindingTest', () => {
      const missingKey = preview({ carryForwardAccount: null, blocked: true })

      expect(carriesNoResult(missingKey)).toBe(false)
    })

    /** Absent and empty are the same news: the field is optional in the answer. */
    it('carriesNoResultWithoutTheFieldTest', () => {
      expect(carriesNoResult({ ...nothingToCarry(), carryForwardAccount: undefined })).toBe(true)
      expect(carriesNoResult({ ...nothingToCarry(), carryForwardAccount: '' })).toBe(true)
    })
  })

  describe('closingSummarySentence', () => {
    /** The last sentence before books are written names the figure, the account and the year. */
    it('closingSummarySentenceTest', () => {
      const sentence = closingSummarySentence(preview())

      expect(sentence).toContain('Gewinn')
      expect(sentence).toContain('2970')
      expect(sentence).toContain('4 Konten')
      expect(sentence).toContain('neu angelegte Geschäftsjahr 2027')
    })

    /** A loss is named a loss: «Der Gewinn wird vorgetragen» in a bad year reads as a lie. */
    it('closingSummarySentenceWithALossTest', () => {
      const sentence = closingSummarySentence({ ...preview(), expectedResult: -1200 })

      expect(sentence).toContain('Verlust')
      expect(sentence).not.toContain('Gewinn')
    })

    /** A following year that stands is used rather than opened, and the sentence says so. */
    it('closingSummarySentenceWithAnExistingFollowingYearTest', () => {
      const existing = preview()
      const sentence = closingSummarySentence({
        ...existing,
        followingYear: { ...existing.followingYear, exists: true, status: 'OPEN' },
      })

      expect(sentence).toContain('bestehende Geschäftsjahr 2027')
    })

    /**
     * <b>What the person picked wins over the backend's default.</b> The sentence is the last
     * thing read before books are written, and the run is sent the picked account — a sentence
     * naming a different one would be the one place nobody could have known.
     */
    it('closingSummarySentenceWithAPickedAccountTest', () => {
      const sentence = closingSummarySentence(preview(), '2850')

      expect(sentence).toContain('Konto 2850')
      expect(sentence).not.toContain('2970')
    })

    /** Nothing picked yet: the default stands, which is what the run would take too. */
    it('closingSummarySentenceWithoutAPickTest', () => {
      expect(closingSummarySentence(preview(), '')).toContain('Konto 2970')
      expect(closingSummarySentence(preview(), undefined)).toContain('Konto 2970')
    })

    /**
     * <b>No account because there is nothing to carry, and the sentence says that.</b> A close
     * that comes out at nil writes no line for the result, so «Der Gewinn wird auf Konto —
     * vorgetragen» would name a booking that does not happen. The accounts that do move over
     * are still counted.
     */
    it('closingSummarySentenceWithoutACarryAccountTest', () => {
      const sentence = closingSummarySentence(nothingToCarry())

      expect(sentence).toBe(
        'Es wird kein Ergebnis vorgetragen, und 4 Konten werden in das neu angelegte' +
          ' Geschäftsjahr 2027 übernommen.',
      )
      expect(sentence).not.toContain('—')
    })

    /**
     * <b>And not even a picked account resurrects it.</b> The carry forward writes a line for the
     * result only where there is one (`CarryForward.of`), so «Der Gewinn wird auf Konto 2850
     * vorgetragen» beside a picked account would describe a booking that does not happen.
     */
    it('closingSummarySentenceWithoutAResultButAPickTest', () => {
      const sentence = closingSummarySentence(nothingToCarry(), '2850')

      expect(sentence).toContain('Es wird kein Ergebnis vorgetragen')
      expect(sentence).not.toContain('2850')
    })

    /**
     * <b>The dash is left for the one case that really is a gap.</b> A missing account beside a
     * blocking finding is an unassigned system key, which step 1 names; claiming «nichts
     * vorzutragen» there would talk somebody past a red cross.
     */
    it('closingSummarySentenceWithABlockingFindingTest', () => {
      const sentence = closingSummarySentence({
        ...preview(),
        carryForwardAccount: null,
        blocked: true,
      })

      expect(sentence).toContain('Der Gewinn wird auf Konto — vorgetragen')
    })
  })

  describe('accrualLineOf', () => {
    /** The statement of the run that belongs to a person rather than to the machine. */
    it('accrualLineOfTest', () => {
      const found = accrualLineOf([
        logLine('STATUS'),
        logLine('ACCRUALS'),
        logLine('MODULE_ON'),
      ])

      expect(found?.event).toBe('ACCRUALS')
    })

    /** A year closed before this confirmation existed carries none, and that is a state. */
    it('accrualLineOfWithoutOneTest', () => {
      expect(accrualLineOf([logLine('STATUS')])).toBeUndefined()
      expect(accrualLineOf([])).toBeUndefined()
    })
  })

  describe('asksCarryForward', () => {
    /**
     * A sole proprietorship chooses between its capital and its private account, and that choice
     * is the habit of its fiduciary rather than anything derivable from the chart.
     */
    it('asksCarryForwardTest', () => {
      const own = preview({
        equityLayout: 'SOLE_PROPRIETOR',
        carryForwardOptions: [
          { accountNumber: '2800', accountName: 'Eigenkapital zu Beginn des Geschäftsjahres' },
          { accountNumber: '2850', accountName: 'Privat' },
        ],
      })

      expect(asksCarryForward(own)).toBe(true)
    })

    /**
     * <b>A company is never asked.</b> Its result is carried onto «Gewinnvortrag oder
     * Verlustvortrag», which follows from the layout of its equity — a question with one
     * possible answer teaches people to click past questions.
     */
    it('asksCarryForwardForACompanyTest', () => {
      expect(asksCarryForward(preview({ equityLayout: 'JURISTIC' }))).toBe(false)
    })

    /**
     * <b>A partnership is asked, and a remembered answer does not end the question.</b> The
     * backend names last year's account in `carryForwardAccount` and offers its four options
     * beside it; showing the remembered one as a fixed line would take away the one screen on
     * which a Kollektivgesellschaft can move the result from the capital account of one partner
     * to the private account of another.
     *
     * <p>That there are exactly four of them — 2800 and 2850 the capital accounts, 2820 and 2870
     * the private ones, and never 2810 or 2860, which are the accounts for paying capital in and
     * out — is not decided here: this function reads `length`, and the frontend filters nothing.
     * It is checked where the picker is built, in
     * `ClosingPage.closingPageAsksAPartnershipWhereTheResultGoesTest`.
     */
    it('asksCarryForwardForAPartnershipTest', () => {
      const partnership = preview({
        equityLayout: 'PARTNERSHIP',
        carryForwardAccount: '2820',
        carryForwardOptions: PARTNERSHIP_OPTIONS,
      })

      expect(asksCarryForward(partnership)).toBe(true)
      expect(asksCarryForward({ ...partnership, carryForwardAccount: null })).toBe(true)
    })

    /**
     * And a partnership whose chart holds none of the four is not asked either — the same rule
     * as for a sole proprietorship, and it is the second half of what this function decides.
     */
    it('asksCarryForwardForAPartnershipWithoutAnOptionTest', () => {
      const bare = preview({ equityLayout: 'PARTNERSHIP', carryForwardOptions: [] })

      expect(asksCarryForward(bare)).toBe(false)
    })

    /**
     * A chart that holds no capital and no private account leaves nothing to pick. What is
     * missing is said by the findings of the first step, not by an empty picker.
     */
    it('asksCarryForwardWithoutAnOptionTest', () => {
      const bare = preview({ equityLayout: 'SOLE_PROPRIETOR', carryForwardOptions: [] })

      expect(asksCarryForward(bare)).toBe(false)
    })

    /** No layout chosen: asked rather than settled, because nothing settles it. */
    it('asksCarryForwardWithoutALayoutTest', () => {
      expect(asksCarryForward(preview({ equityLayout: null }))).toBe(true)
    })
  })

  describe('carryForwardHint', () => {
    /** For a company the account is settled, and the step says so rather than asking. */
    it('carryForwardHintTest', () => {
      const hint = carryForwardHint(preview({ equityLayout: 'JURISTIC' }))

      expect(hint).toContain('AG oder GmbH')
      expect(hint).toContain('steht das Vortragskonto fest')
    })

    /**
     * <b>Three reasons lead to the same fixed line, and they are not the same news.</b> Saying
     * «steht fest» about a chart that holds no capital account would send somebody looking for a
     * decision that nobody has to make.
     */
    it('carryForwardHintWithoutAnOptionTest', () => {
      const hint = carryForwardHint(
        preview({ equityLayout: 'SOLE_PROPRIETOR', carryForwardOptions: [] }),
      )

      expect(hint).toContain('kein Kapital- und kein Privatkonto')
      expect(hint).not.toContain('steht fest')
    })

    /**
     * <b>«Nothing to carry» is the third of them, and it is asked first — for a company as
     * well.</b> The sentence about the settled account promises that the run books onto it, and
     * that is exactly what a close with no result does not do. The line also says that this is
     * no fault, because a dormant company reads it in the last step before it presses the
     * button.
     */
    it('carryForwardHintWithoutAResultTest', () => {
      const hint = carryForwardHint(nothingToCarry())

      expect(hint).toContain('Ein Vortragskonto braucht es nur für ein Ergebnis')
      expect(hint).toContain('hält den Abschluss nicht auf')
      expect(carryForwardHint({ ...nothingToCarry(), equityLayout: 'JURISTIC' })).toBe(hint)
    })
  })

  describe('appropriationSentence', () => {
    /**
     * A company: the general meeting decides (OR Art. 698 Abs. 2 Ziff. 4), and the booking that
     * follows from its resolution is entered by hand.
     */
    it('appropriationSentenceTest', () => {
      const sentence = appropriationSentence(preview({ equityLayout: 'JURISTIC' }))

      expect(sentence).toContain('Die Gewinnverwendung wird nicht gebucht.')
      expect(sentence).toContain('Generalversammlung')
      expect(sentence).toContain('OR Art. 698 Abs. 2 Ziff. 4')
      expect(sentence).toContain('2970 an 2269')
    })

    /** A sole proprietorship has no meeting at all: its result runs over capital and private. */
    it('appropriationSentenceForASoleProprietorTest', () => {
      const sentence = appropriationSentence(preview({ equityLayout: 'SOLE_PROPRIETOR' }))

      expect(sentence).toContain('Einzelunternehmen')
      expect(sentence).toContain('Kapital- und Privatkonten')
      expect(sentence).not.toContain('Generalversammlung')
    })

    /**
     * <b>A partnership reads the same sentence, and that is how #96 assigns it:</b> «für
     * Einzelunternehmen und Personengesellschaften sagt er den anderen Satz». It holds no
     * general meeting either, and its result runs over capital and private accounts just the
     * same.
     */
    it('appropriationSentenceForAPartnershipTest', () => {
      const sentence = appropriationSentence(preview({ equityLayout: 'PARTNERSHIP' }))

      expect(sentence).toBe(appropriationSentence(preview({ equityLayout: 'SOLE_PROPRIETOR' })))
      expect(sentence).toContain('Kapital- und Privatkonten')
      expect(sentence).not.toContain('Generalversammlung')
    })

    /**
     * Without a layout the sentence of a sole proprietorship stands: the step is not reachable
     * in that state, and of the two it is the one that promises nothing.
     */
    it('appropriationSentenceWithoutALayoutTest', () => {
      expect(appropriationSentence(preview({ equityLayout: null }))).toBe(
        appropriationSentence(preview({ equityLayout: 'SOLE_PROPRIETOR' })),
      )
    })
  })

  describe('blockingLaterYear', () => {
    /** The closed year somebody wants to open again. */
    const closed = year(1, '2026', '2026-01-01', 'CLOSED')

    /** A later year that is closed would have to take the counter entries of the reopening. */
    it('blockingLaterYearTest', () => {
      const blocking = blockingLaterYear([closed, year(2, '2027', '2027-01-01', 'CLOSED')], closed)

      expect(blocking?.label).toBe('2027')
    })

    /** Every later year open: the way is clear and the dialog asks for a reason. */
    it('blockingLaterYearWithEveryLaterYearOpenTest', () => {
      const years = [
        closed,
        year(2, '2027', '2027-01-01', 'OPEN'),
        year(3, '2028', '2028-01-01', 'OPEN'),
      ]

      expect(blockingLaterYear(years, closed)).toBeUndefined()
    })

    /** The last year of the tenant: nothing follows it, so nothing is in the way. */
    it('blockingLaterYearWithoutALaterYearTest', () => {
      expect(blockingLaterYear([closed], closed)).toBeUndefined()
      expect(blockingLaterYear([], closed)).toBeUndefined()
    })

    /** `LOCKED` blocks exactly as `CLOSED` does: neither year takes a counter entry. */
    it('blockingLaterYearWithALockedYearTest', () => {
      const blocking = blockingLaterYear([closed, year(2, '2027', '2027-01-01', 'LOCKED')], closed)

      expect(blocking?.label).toBe('2027')
    })

    /**
     * <b>Every later year, not only the one that follows.</b> A year further out that is closed
     * would take the next close with it.
     */
    it('blockingLaterYearTwoYearsOutTest', () => {
      const years = [
        closed,
        year(2, '2027', '2027-01-01', 'OPEN'),
        year(3, '2028', '2028-01-01', 'CLOSED'),
      ]

      expect(blockingLaterYear(years, closed)?.label).toBe('2028')
    })

    /** The earliest one in the way is the one to name: it is where the person has to go first. */
    it('blockingLaterYearNamesTheEarliestTest', () => {
      const years = [
        closed,
        year(3, '2028', '2028-01-01', 'CLOSED'),
        year(2, '2027', '2027-01-01', 'LOCKED'),
      ]

      expect(blockingLaterYear(years, closed)?.label).toBe('2027')
    })

    /** An earlier year that is closed is not in the way: no counter entry ever reaches it. */
    it('blockingLaterYearWithAnEarlierClosedYearTest', () => {
      const years = [
        year(0, '2025', '2025-01-01', 'CLOSED'),
        closed,
        year(2, '2027', '2027-01-01', 'OPEN'),
      ]

      expect(blockingLaterYear(years, closed)).toBeUndefined()
    })
  })

  describe('laterYearSentence', () => {
    /**
     * Word for word the sentence the backend refuses with. Two wordings for one rule would read
     * as two different rules the first time somebody hits the second one.
     */
    it('laterYearSentenceTest', () => {
      const sentence = laterYearSentence(
        year(2, '2027', '2027-01-01', 'CLOSED'),
        year(1, '2026', '2026-01-01', 'CLOSED'),
      )

      expect(sentence).toBe(
        'Das Geschäftsjahr 2027 ist abgeschlossen. Öffnen Sie zuerst 2027, dann 2026.',
      )
    })

    /** A locked year is in the way just as much, and it is not called abgeschlossen. */
    it('laterYearSentenceForALockedYearTest', () => {
      const sentence = laterYearSentence(
        year(2, '2027', '2027-01-01', 'LOCKED'),
        year(1, '2026', '2026-01-01', 'CLOSED'),
      )

      expect(sentence).toBe(
        'Das Geschäftsjahr 2027 ist gesperrt. Öffnen Sie zuerst 2027, dann 2026.',
      )
    })
  })
})

/**
 * The four accounts a Kollektiv- or Kommanditgesellschaft picks from.
 *
 * <p>2800 and 2850 are the capital accounts, 2820 and 2870 the private ones. 2810 and 2860 are
 * the accounts for paying capital in and out and carry no result; the backend leaves them out of
 * the options, and the frontend shows what it is given.
 */
const PARTNERSHIP_OPTIONS = [
  { accountNumber: '2800', accountName: 'Eigenkapital Gesellschafter A' },
  { accountNumber: '2820', accountName: 'Privat Gesellschafter A' },
  { accountNumber: '2850', accountName: 'Eigenkapital Kommanditär A' },
  { accountNumber: '2870', accountName: 'Privat Kommanditär A' },
]

/**
 * A close that carries nothing: no account named, nothing blocking, and the result at nil.
 *
 * <p>All three together, because the backend produces them together — it leaves the account empty
 * only where there is nothing to carry, and finding 5 blocks a missing account for any other
 * result. A fixture with a profit beside an empty account would be a state nobody can reach.
 */
function nothingToCarry(over: Partial<ClosingPreview> = {}): ClosingPreview {
  return preview({ carryForwardAccount: null, expectedResult: 0, ...over })
}

/** What the run would do, with whatever a single case has to say differently. */
function preview(over: Partial<ClosingPreview> = {}): ClosingPreview {
  return {
    checks: [passed('1'), passed('2')],
    accruals: [],
    netRevenue: 120000,
    financialIncome: 250,
    expectedResult: 38214.9,
    closingLineCount: 5,
    carryForwardAccount: '2970',
    carryForwardOptions: [{ accountNumber: '2970', accountName: 'Gewinnvortrag' }],
    followingYear: {
      label: '2027',
      startDate: '2027-01-01',
      endDate: '2027-12-31',
      numberYear: 2027,
      exists: false,
      status: null,
    },
    replacesOpeningEntry: false,
    carriedAccounts: 4,
    blocked: false,
    ...over,
  }
}

function passed(step: string): ClosingCheck {
  return { step, passed: true, blocking: true, message: `Punkt ${step} steht`, detail: '' }
}

function failed(step: string): ClosingCheck {
  return { step, passed: false, blocking: true, message: `Punkt ${step} fehlt`, detail: 'Tun Sie X.' }
}

function pending(step: string): ClosingCheck {
  return { step, passed: false, blocking: false, message: `Punkt ${step} kommt später`, detail: '' }
}

function year(
  id: number,
  label: string,
  startDate: string,
  status: FiscalYear['status'],
): FiscalYear {
  return {
    id,
    label,
    numberYear: Number(label.slice(0, 4)),
    startDate,
    endDate: `${startDate.slice(0, 4)}-12-31`,
    status,
    deletable: false,
    editable: false,
    spansAFullCalendarYear: true,
    postedEntries: 12,
    postedEntriesBesidesOpening: 11,
  }
}

function logLine(event: YearLogLine['event']): YearLogLine {
  return {
    event,
    status: event === 'STATUS' ? 'CLOSED' : null,
    note: null,
    changedAt: '2027-03-15T09:00:00Z',
    changedBy: 'jan',
  }
}

/** One filed paper of a close, with whatever a single case has to say differently. */
function paper(over: Partial<ArchivedReport> = {}): ArchivedReport {
  return {
    id: 24,
    report: 'balance-sheet',
    origin: 'CLOSING',
    closingNumber: 1,
    title: 'Bilanz',
    asOfDate: '2026-12-31',
    languageCode: 'de',
    byteCount: 184_320,
    sha256: 'a'.repeat(64),
    entryCount: 34,
    lastChainNumber: 1842,
    createdAt: '2027-03-15T09:00:00Z',
    createdBy: 'jan',
    ...over,
  }
}

/**
 * The five papers one closing run filed, in the order the run drew them — the ids climb with
 * it, because that is the order `archivedReportIds` names.
 */
function filed(closingNumber: number, firstId: number): ArchivedReport[] {
  const reports: ArchivedReport['report'][] = [
    'journal',
    'account-sheets',
    'trial-balance',
    'balance-sheet',
    'income-statement',
  ]
  return reports.map((report, index) => paper({ id: firstId + index, report, closingNumber }))
}
