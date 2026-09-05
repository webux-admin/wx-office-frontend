// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyEntryRow, entryTemplatesKey, type EntryDraftRow } from '../../lib/accounting'
import type { Account, EntryTemplate, EntryTemplateLine, TaxCode } from '../../lib/types'
import { SaveTemplateDialog } from './SaveTemplateDialog'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  sent.length = 0
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

/** Every write the dialog sent, so a test can read what went out, where and how. */
const sent: { url: string; method: string; body: Record<string, unknown> }[] = []

const CHART: Account[] = [
  {
    id: 1,
    accountNumber: '1020',
    name: 'Bankguthaben',
    accountType: 'ASSET',
    orPosition: 'UV_FLUESSIGE_MITTEL',
    directPostingAllowed: true,
    active: true,
  },
  {
    id: 4,
    accountNumber: '6000',
    name: 'Raumaufwand',
    accountType: 'EXPENSE',
    orPosition: 'ER_UEBRIGER_BETRIEBSAUFWAND',
    directPostingAllowed: true,
    active: true,
  },
]

const TAX_CODES: TaxCode[] = []

function row(over: Partial<EntryDraftRow>): EntryDraftRow {
  return { ...emptyEntryRow(1), ...over }
}

const TYPED: EntryDraftRow[] = [
  row({ key: 1, accountId: 4, accountText: '6000 Raumaufwand', debit: '3200' }),
  row({ key: 2, accountId: 1, accountText: '1020 Bankguthaben', credit: '3200' }),
]

function line(over: Partial<EntryTemplateLine> = {}): EntryTemplateLine {
  return {
    accountId: 4,
    accountNumber: '6000',
    accountName: 'Raumaufwand',
    side: 'DEBIT',
    amount: 3200,
    taxCodeId: null,
    taxCode: null,
    text: null,
    postable: true,
    ...over,
  }
}

/**
 * The template already on file — carrying the header fields of **last month**, deliberately not
 * the ones the mask is painted with. Identical values on both sides would let a `PUT` that
 * keeps the old ones pass unnoticed, and that is the very thing this fixture is here to catch.
 */
const EXISTING: EntryTemplate = {
  id: 300,
  name: 'Miete Geschäftslokal',
  description: 'jeden Monatsletzten',
  entryDescription: 'Miete August',
  documentReference: 'MB-143',
  carriesAmounts: true,
  sortOrder: 2,
  version: 3,
  lines: [line()],
  problems: [],
}

/**
 * @param writeStatus what the server answers a write with. 409 is the lost version check.
 */
function stubFetch(writeStatus = 200) {
  vi.stubGlobal('fetch', (url: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET'
    if (method !== 'GET') {
      sent.push({
        url,
        method,
        body: typeof options?.body === 'string' ? JSON.parse(options.body) : {},
      })
    }
    return Promise.resolve(
      new Response(JSON.stringify({ id: 300 }), {
        status: method === 'GET' ? 200 : writeStatus,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
}

/**
 * @returns the query client behind the dialog, so a test can read whether the template list was
 *   marked stale — the dialog holds its templates as a prop, so a refetch is not observable as a
 *   request here, but the invalidation is
 */
async function paint(templates: EntryTemplate[], writeStatus = 200) {
  stubFetch(writeStatus)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // Seeded, so there is a cache entry an invalidation can be read off at all.
  client.setQueryData(entryTemplatesKey(1), templates)
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <SaveTemplateDialog
          tenantId={1}
          rows={TYPED}
          entryDescription="Miete September"
          documentReference="MB-144"
          accounts={CHART}
          taxCodes={TAX_CODES}
          templates={templates}
          onClose={() => {}}
        />
      </QueryClientProvider>,
    )
  })
  return client
}

function field(label: string): HTMLInputElement {
  const found = [...container.querySelectorAll('label')].find(
    (candidate) => candidate.textContent === label,
  )
  const input = found === undefined ? null : document.getElementById(found.htmlFor)
  if (input === null) throw new Error(`Feld «${label}» fehlt`)
  return input as HTMLInputElement
}

function type(element: HTMLElement, value: string) {
  const input = element as HTMLInputElement
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function button(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(
    (entry) => entry.textContent === text,
  ) as HTMLButtonElement | undefined
}

async function settle() {
  for (let round = 0; round < 3; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  }
}

describe('SaveTemplateDialog', () => {
  /** The ordinary way: a name, and the two rows of the grid become the lines of a template. */
  it('saveTemplateTest', async () => {
    await paint([])

    // The dialog says what is being kept, and that the date is not part of it.
    expect(container.textContent).toContain(
      'Gespeichert werden 2 Zeilen: 6000 im Soll, 1020 im Haben.',
    )
    expect(container.textContent).toContain('Das Datum gehört nicht zur Vorlage.')
    expect(container.textContent).toContain('Die Vorlage kommt zuunterst ins Menü.')

    type(field('Name'), 'Miete Geschäftslokal')
    type(field('Beschreibung'), 'jeden Monatsletzten')
    await act(async () => {
      button('Speichern')?.click()
    })
    await settle()

    expect(sent).toHaveLength(1)
    expect(sent[0].method).toBe('POST')
    expect(sent[0].url).toBe('/api/tenants/1/accounting/entry-templates')
    expect(sent[0].body.name).toBe('Miete Geschäftslokal')
    expect(sent[0].body.description).toBe('jeden Monatsletzten')
    // Without the tick the amounts stay out: applying then leaves the amount fields empty.
    expect(sent[0].body.lines).toEqual([
      { accountNumber: '6000', side: 'DEBIT', amount: null, taxCode: null, text: null },
      { accountNumber: '1020', side: 'CREDIT', amount: null, taxCode: null, text: null },
    ])
  })

  /** With the tick the amounts travel, and the hint says what that means. */
  it('saveTemplateWithAmountsTest', async () => {
    await paint([])

    type(field('Name'), 'Miete Geschäftslokal')
    await act(async () => {
      field('Beträge mitspeichern').click()
    })
    await act(async () => {
      button('Speichern')?.click()
    })
    await settle()

    expect(sent[0].body.lines).toEqual([
      { accountNumber: '6000', side: 'DEBIT', amount: 3200, taxCode: null, text: null },
      { accountNumber: '1020', side: 'CREDIT', amount: 3200, taxCode: null, text: null },
    ])
  })

  /** No name, no template — and nothing goes out over the wire. */
  it('saveTemplateWithoutNameTest', async () => {
    await paint([])

    await act(async () => {
      button('Speichern')?.click()
    })
    await settle()

    expect(container.textContent).toContain('Die Vorlage braucht einen Namen.')
    expect(sent).toHaveLength(0)
  })

  /**
   * The name is taken. The dialog asks once and then sends a `PUT` — never a second `POST` —
   * with the id, the version and the **unchanged** place of the template it overwrites. So the
   * template keeps its place in the menu, and whoever changed it in another tab in the meantime
   * gets the 409 instead of a silent overwrite.
   */
  it('saveTemplateWithExistingNameTest', async () => {
    await paint([EXISTING])

    type(field('Name'), 'Miete Geschäftslokal')
    await act(async () => {
      button('Speichern')?.click()
    })
    await settle()

    // Asked, and nothing sent yet.
    expect(container.textContent).toContain(
      'Eine Vorlage «Miete Geschäftslokal» gibt es schon. Überschreiben?',
    )
    expect(sent).toHaveLength(0)
    // And with the question the description of the template on file stands in the field. The
    // mask carries none of its own, so an empty field here is what goes out.
    expect(field('Beschreibung').value).toBe('jeden Monatsletzten')
    // The sentence about the place follows the button. Overwriting keeps the old sortOrder —
    // asserted below — so «kommt zuunterst» would state the reverse of what is about to happen,
    // at the moment somebody is deciding whether to do it.
    expect(container.textContent).toContain('Die Vorlage behält ihren Platz im Menü.')
    expect(container.textContent).not.toContain('Die Vorlage kommt zuunterst ins Menü.')

    await act(async () => {
      button('Überschreiben')?.click()
    })
    await settle()

    expect(sent).toHaveLength(1)
    expect(sent[0].method).toBe('PUT')
    expect(sent[0].url).toBe('/api/tenants/1/accounting/entry-templates/300')
    expect(sent[0].body.version).toBe(3)
    expect(sent[0].body.sortOrder).toBe(2)
    expect(sent[0].body.name).toBe('Miete Geschäftslokal')
    // And the lines are the ones out of the grid: this is the only way to change them.
    expect(sent[0].body.lines).toHaveLength(2)
    // The two header fields come out of the **mask**, not out of the template on file.
    // Overwriting is the one documented way to change a template: whoever corrects the text
    // field and saves under the same name means that text, and would otherwise still be
    // proposed the old one next month.
    expect(sent[0].body.entryDescription).toBe('Miete September')
    expect(sent[0].body.documentReference).toBe('MB-144')
    // The description, though, comes out of the **template on file**: unlike the two fields
    // above, the mask holds none, and the whole payload goes over the old template. A `null`
    // here emptied the hint line under the name in the menu — silently, on every overwrite.
    expect(sent[0].body.description).toBe('jeden Monatsletzten')
  })

  /**
   * A lost version check must not become a dead end.
   *
   * <p>The version this dialog sends comes off the `templates` prop, which is served out of a
   * cache. A 409 says somebody else has moved the template on, so sending that same version
   * again could only fail the same way — and the cache would keep handing it over for as long
   * as nothing else happened to refresh it. The list is therefore marked stale after a refused
   * write too, which is what `onSettled` buys over `onSuccess`, and the dialog stays open with
   * its question so the next attempt carries the version the server now holds.
   */
  it('saveTemplateWithStaleVersionTest', async () => {
    const client = await paint([EXISTING], 409)

    type(field('Name'), 'Miete Geschäftslokal')
    await act(async () => {
      button('Speichern')?.click()
    })
    await settle()
    await act(async () => {
      button('Überschreiben')?.click()
    })
    await settle()

    // The write went out and was refused.
    expect(sent).toHaveLength(1)
    expect(sent[0].method).toBe('PUT')
    // And the list is stale all the same, so the next read brings the version that now holds.
    expect(client.getQueryState(entryTemplatesKey(1))?.isInvalidated).toBe(true)
    // The dialog stays open: closing it would throw away the typed lines the retry needs.
    expect(container.textContent).toContain(
      'Eine Vorlage «Miete Geschäftslokal» gibt es schon. Überschreiben?',
    )
  })

  /**
   * A description typed before the question wins over the one on file: whoever writes one means
   * it. That is the way the hint line in the menu is changed from here.
   */
  it('saveTemplateWithExistingNameAndANewDescriptionTest', async () => {
    await paint([EXISTING])

    type(field('Name'), 'Miete Geschäftslokal')
    type(field('Beschreibung'), 'jeden 25.')
    await act(async () => {
      button('Speichern')?.click()
    })
    await settle()

    // What was typed stays: the template on file does not overwrite it.
    expect(field('Beschreibung').value).toBe('jeden 25.')

    await act(async () => {
      button('Überschreiben')?.click()
    })
    await settle()

    expect(sent).toHaveLength(1)
    expect(sent[0].method).toBe('PUT')
    expect(sent[0].body.description).toBe('jeden 25.')
  })

  /**
   * The name differs in case only. The server compares exactly — `requireFreeName` uses
   * `equals` behind a `UNIQUE (tenant_id, name)` — so «miete geschäftslokal» is free beside
   * «Miete Geschäftslokal». Asking to overwrite here would rename the template on file to lower
   * case and replace its lines, instead of storing the second one the server accepts.
   */
  it('saveTemplateWithADifferentCaseNameTest', async () => {
    await paint([EXISTING])

    type(field('Name'), 'miete geschäftslokal')
    await act(async () => {
      button('Speichern')?.click()
    })
    await settle()

    expect(container.textContent).not.toContain('Überschreiben?')
    expect(sent).toHaveLength(1)
    expect(sent[0].method).toBe('POST')
    expect(sent[0].url).toBe('/api/tenants/1/accounting/entry-templates')
    expect(sent[0].body.name).toBe('miete geschäftslokal')
  })
})
