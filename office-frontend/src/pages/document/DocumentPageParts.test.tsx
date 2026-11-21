// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SalesDocument } from '../../lib/types'
import { ORDER_KIND } from '../../lib/salesDocument'
import { DocumentTexts } from './DocumentPageParts'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

/** A draft order that carries a header text and no lines. */
const ORDER: SalesDocument = {
  id: 42,
  documentTypeId: 1,
  category: 'ORDER',
  status: 'DRAFT',
  documentDate: '2026-08-21',
  partnerId: 3,
  language: 'de',
  currency: 'CHF',
  baseCurrency: 'CHF',
  totalNet: 0,
  totalVat: 0,
  totalGross: 0,
  subtotalsIncludeVat: false,
  pricesIncludeVat: false,
  lines: [],
  headerText: 'Vielen Dank für Ihren Auftrag.',
}

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
  vi.restoreAllMocks()
})

async function renderTexts(onDirtyChange: (dirty: boolean) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <DocumentTexts
          tenantId={TENANT}
          kind={ORDER_KIND}
          document={ORDER}
          editable
          onDirtyChange={onDirtyChange}
        />
      </QueryClientProvider>,
    )
  })
}

/** The text area behind the label, typed into the way the user does it. */
async function typeIntoHeaderText(value: string) {
  const caption = [...container.querySelectorAll('label')].find(
    (entry) => entry.textContent === 'Kopftext',
  )
  const area = caption && document.getElementById(caption.htmlFor)
  if (!(area instanceof HTMLTextAreaElement)) throw new Error('no header text field')
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(area, value)
    area.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('DocumentTexts', () => {
  it('documentTextsReportNothingToSaveWhenUnchangedTest', async () => {
    const onDirtyChange = vi.fn()
    await renderTexts(onDirtyChange)

    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })

  it('documentTextsReportTypedTextAsUnsavedTest', async () => {
    const onDirtyChange = vi.fn()
    await renderTexts(onDirtyChange)

    await typeIntoHeaderText('Vielen Dank für Ihre Bestellung.')

    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
  })

  it('documentTextsTakeBackATypedChangeTest', async () => {
    const onDirtyChange = vi.fn()
    await renderTexts(onDirtyChange)

    await typeIntoHeaderText('Anderer Text')
    await typeIntoHeaderText('Vielen Dank für Ihren Auftrag.')

    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })
})
