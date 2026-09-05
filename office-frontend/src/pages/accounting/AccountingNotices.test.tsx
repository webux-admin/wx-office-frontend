// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ReportNotices } from '../../lib/types'
import { AccountingNotices } from './AccountingNotices'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function notices(over: Partial<ReportNotices> = {}): ReportNotices {
  return { drafts: 0, draftTotal: null, currencyCode: 'CHF', moduleGaps: [], ...over }
}

function paint(value: ReportNotices) {
  act(() => {
    root.render(
      <MemoryRouter>
        <AccountingNotices notices={value} />
      </MemoryRouter>,
    )
  })
}

describe('AccountingNotices', () => {
  /**
   * <b>Not a warning about a mistake.</b> A draft is the normal state of an entry somebody is in
   * the middle of; it stands here because an evaluation that silently leaves 12'480.55 out is one
   * nobody can rely on. Hence the amount, the currency, and the way to look at it.
   */
  it('draftNoticeShowsCountAndAmountTest', () => {
    paint(notices({ drafts: 3, draftTotal: 12480.55 }))

    expect(container.textContent).toContain('3 Buchungen sind noch nicht verbucht')
    expect(container.textContent).toContain('12’480.55 CHF')
    expect(container.textContent).toContain('nicht enthalten')
    const link = container.querySelector('a')
    expect(link?.getAttribute('href')).toBe('/buchhaltung/entwuerfe')
  })

  /** One draft is one sentence, not «1 Buchungen». */
  it('draftNoticeInTheSingularTest', () => {
    paint(notices({ drafts: 1, draftTotal: 500 }))

    expect(container.textContent).toContain('1 Buchung ist noch nicht verbucht')
    expect(container.textContent).toContain('Sie ist in dieser Auswertung nicht enthalten')
  })

  /**
   * Nothing waiting, nothing said. A box that stood there empty would be a permanent warning
   * about the normal case.
   */
  it('draftNoticeStaysHiddenWithoutDraftsTest', () => {
    paint(notices())

    expect(container.textContent).toBe('')
  })

  /** The currency comes out of the answer and is never guessed at by the screen. */
  it('draftNoticeTakesTheCurrencyFromTheAnswerTest', () => {
    paint(notices({ drafts: 2, draftTotal: 100, currencyCode: 'EUR' }))

    expect(container.textContent).toContain('EUR')
    expect(container.textContent).not.toContain('CHF')
  })

  /** A closed stretch names both of its days. */
  it('moduleGapNoticeNamesThePeriodTest', () => {
    paint(notices({ moduleGaps: [{ from: '2026-03-14', to: '2026-07-02', open: false }] }))

    expect(container.textContent).toContain(
      'Die Buchhaltung war vom 14.03.2026 bis 02.07.2026 abgeschaltet.',
    )
    expect(container.textContent).toContain('nichts erfassen und nichts verbuchen')
  })

  /**
   * <b>An open stretch says «seit dem …».</b> Naming an end that has not happened would be a
   * claim about the future, on a document somebody files for ten years.
   */
  it('moduleGapNoticeForAnOpenPeriodTest', () => {
    paint(notices({ moduleGaps: [{ from: '2026-03-14', to: '2026-12-31', open: true }] }))

    expect(container.textContent).toContain('Die Buchhaltung ist seit dem 14.03.2026 abgeschaltet')
    expect(container.textContent).not.toContain('31.12.2026')
  })

  /** Two stretches are two sentences: one box per period, not one box listing them. */
  it('moduleGapNoticeForTwoPeriodsTest', () => {
    paint(
      notices({
        moduleGaps: [
          { from: '2026-03-14', to: '2026-04-02', open: false },
          { from: '2026-08-01', to: '2026-09-05', open: true },
        ],
      }),
    )

    expect(container.textContent).toContain('vom 14.03.2026 bis 02.04.2026')
    expect(container.textContent).toContain('seit dem 01.08.2026')
  })

  /** Both boxes at once, in the order they are read: what is missing, then when nothing ran. */
  it('accountingNoticesShowsBothTest', () => {
    paint(
      notices({
        drafts: 2,
        draftTotal: 900,
        moduleGaps: [{ from: '2026-03-14', to: '2026-07-02', open: false }],
      }),
    )

    const text = container.textContent ?? ''
    expect(text.indexOf('noch nicht verbucht')).toBeGreaterThanOrEqual(0)
    expect(text.indexOf('abgeschaltet')).toBeGreaterThan(text.indexOf('noch nicht verbucht'))
  })
})
