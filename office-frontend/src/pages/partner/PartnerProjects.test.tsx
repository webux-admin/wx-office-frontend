// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Page, Project } from '../../lib/types'
import { PartnerProjects } from './PartnerProjects'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function project(id: number, name: string, status: Project['status']): Project {
  return {
    id,
    projectNumber: `P-0000${id}`,
    name,
    partnerId: 11,
    customerName: 'Bäckerei Huber AG',
    contactPersonId: null,
    contactPersonName: null,
    responsibleUserId: null,
    responsibleName: null,
    startDate: '2026-03-02',
    endDate: null,
    description: null,
    status,
  }
}

function page(content: Project[]): Page<Project> {
  return {
    content,
    page: 0,
    size: 10,
    totalElements: content.length,
    totalPages: content.length === 0 ? 0 : 1,
    sort: 'projectNumber,desc',
  }
}

let container: HTMLDivElement
let root: Root
let requested: string[]
let answer: Page<Project>

beforeEach(() => {
  requested = []
  answer = page([project(2, 'Umbau Showroom', 'ACTIVE'), project(1, 'Ladenbau', 'ARCHIVED')])
  vi.stubGlobal('fetch', (url: string) => {
    requested.push(url)
    return Promise.resolve(
      new Response(JSON.stringify(answer), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/kunden/11']}>
        <QueryClientProvider client={client}>
          <PartnerProjects tenantId={1} partnerId={11} />
        </QueryClientProvider>
      </MemoryRouter>,
    )
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
}

describe('PartnerProjects', () => {
  it('partnerProjectsAsksForThisCustomerWithTheArchiveTest', async () => {
    await render()

    expect(requested).toEqual([
      '/api/tenants/1/projects?partnerId=11&includeArchived=true&page=0&size=10&sort=projectNumber%2Cdesc',
    ])
  })

  it('partnerProjectsShowsArchivedProjectsTooTest', async () => {
    await render()

    const text = container.textContent ?? ''
    expect(text).toContain('Umbau Showroom')
    expect(text).toContain('Aktiv')
    expect(text).toContain('Ladenbau')
    expect(text).toContain('Archiviert')
  })

  it('partnerProjectsWithoutProjectsTest', async () => {
    answer = page([])

    await render()

    expect(container.textContent).toContain('Noch keine Projekte')
  })
})
