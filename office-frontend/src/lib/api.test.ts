// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, UnauthorizedError } from './api'

type Call = { url: string; init: RequestInit }

/** Installs a fetch stub and records what the client sent. */
function stubFetch(response: Response): Call[] {
  const calls: Call[] = []
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return Promise.resolve(response)
  })
  return calls
}

function json(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function headerOf(call: Call, name: string): string | undefined {
  return (call.init.headers as Record<string, string>)[name]
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
})

describe('api.get', () => {
  it('getTest', async () => {
    const calls = stubFetch(json(200, { id: 1, name: 'Webux GmbH' }))

    await expect(api.get('/api/tenants/1')).resolves.toEqual({ id: 1, name: 'Webux GmbH' })
    expect(calls[0].init.method).toBe('GET')
    expect(calls[0].init.credentials).toBe('include')
  })

  it('getWithoutSessionTest', async () => {
    stubFetch(json(401, undefined))

    await expect(api.get('/api/auth/me')).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('getWithoutPermissionTest', async () => {
    stubFetch(json(403, undefined))

    await expect(api.get('/api/tenants')).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
    })
  })

  it('getReportsTheBackendMessageWhenThereIsOneTest', async () => {
    stubFetch(json(400, { message: 'uid is not a valid Swiss UID: CHE-000.000.000' }))

    await expect(api.get('/api/tenants')).rejects.toThrow(
      'uid is not a valid Swiss UID: CHE-000.000.000',
    )
  })

  it('getWithEmptyBodyTest', async () => {
    stubFetch(new Response(null, { status: 200 }))

    await expect(api.get('/api/tenants')).resolves.toBeNull()
  })
})

describe('api.post', () => {
  it('postSendsTheCsrfTokenFromTheCookieTest', async () => {
    document.cookie = 'XSRF-TOKEN=abc-123'
    const calls = stubFetch(json(200, {}))

    await api.post('/api/auth/tenants/2')

    expect(headerOf(calls[0], 'X-XSRF-TOKEN')).toBe('abc-123')
  })

  it('postDecodesAnEscapedCsrfTokenTest', async () => {
    document.cookie = `XSRF-TOKEN=${encodeURIComponent('a+b/c=')}`
    const calls = stubFetch(json(200, {}))

    await api.post('/api/auth/logout')

    expect(headerOf(calls[0], 'X-XSRF-TOKEN')).toBe('a+b/c=')
  })

  it('postWithoutCsrfCookieSendsNoTokenTest', async () => {
    const calls = stubFetch(json(200, {}))

    await api.post('/api/auth/login', { username: 'anna', password: 'geheim' })

    expect(headerOf(calls[0], 'X-XSRF-TOKEN')).toBeUndefined()
    expect(calls[0].init.body).toBe('{"username":"anna","password":"geheim"}')
  })

  it('postWithNoContentAnswerTest', async () => {
    stubFetch(new Response(null, { status: 204 }))

    await expect(api.post('/api/auth/logout')).resolves.toBeUndefined()
  })

  it('postWithWrongCredentialsTest', async () => {
    stubFetch(json(401, undefined))

    await expect(
      api.post('/api/auth/login', { username: 'anna', password: 'falsch' }),
    ).rejects.toBeInstanceOf(UnauthorizedError)
  })
})

describe('api.upload', () => {
  function xmlFile(): File {
    return new File(['<Document/>'], 'camt054.xml', { type: 'application/xml' })
  }

  it('uploadTest', async () => {
    const calls = stubFetch(json(201, { id: 7, state: 'RECEIVED' }))

    await expect(
      api.upload('/api/tenants/1/bank-statements', xmlFile()),
    ).resolves.toEqual({ id: 7, state: 'RECEIVED' })
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.credentials).toBe('include')
  })

  // The one thing this verb exists for: the browser has to set the Content-Type itself,
  // because only it knows the boundary it just generated. Setting it by hand is the classic
  // way to a 500 nobody can explain.
  it('uploadSetsNoContentTypeTest', async () => {
    const calls = stubFetch(json(201, {}))

    await api.upload('/api/tenants/1/bank-statements', xmlFile())

    expect(headerOf(calls[0], 'Content-Type')).toBeUndefined()
    expect(calls[0].init.body).toBeInstanceOf(FormData)
  })

  it('uploadSendsTheFileAsThePartTest', async () => {
    const calls = stubFetch(json(201, {}))

    await api.upload('/api/tenants/1/bank-statements', xmlFile())

    const sent = (calls[0].init.body as FormData).get('file') as File
    expect(sent.name).toBe('camt054.xml')
  })

  it('uploadWithAnotherPartNameTest', async () => {
    const calls = stubFetch(json(201, {}))

    await api.upload('/api/import', xmlFile(), 'datei')

    expect((calls[0].init.body as FormData).get('datei')).not.toBeNull()
  })

  // An upload is a write like any other, so it carries the token like any other.
  it('uploadCarriesTheCsrfTokenTest', async () => {
    document.cookie = 'XSRF-TOKEN=abc-123'
    const calls = stubFetch(json(201, {}))

    await api.upload('/api/tenants/1/bank-statements', xmlFile())

    expect(headerOf(calls[0], 'X-XSRF-TOKEN')).toBe('abc-123')
  })

  it('uploadWithARejectedFileTest', async () => {
    stubFetch(json(400, { detail: 'Für die IBAN CH44… ist kein Bankkonto erfasst' }))

    await expect(api.upload('/api/tenants/1/bank-statements', xmlFile())).rejects.toThrow(
      'Für die IBAN CH44… ist kein Bankkonto erfasst',
    )
  })

  it('uploadWithoutASessionTest', async () => {
    stubFetch(json(401, undefined))

    await expect(
      api.upload('/api/tenants/1/bank-statements', xmlFile()),
    ).rejects.toBeInstanceOf(UnauthorizedError)
  })

  // 409 means the tenant does not run the module; the message has to reach the mask.
  it('uploadWithTheModuleOffTest', async () => {
    stubFetch(json(409, { detail: 'Der Mandant betreibt den Bankauszug nicht' }))

    await expect(
      api.upload('/api/tenants/1/bank-statements', xmlFile()),
    ).rejects.toBeInstanceOf(ApiError)
  })
})
describe('api.file', () => {
  function pdf(status: number, disposition?: string): Response {
    const headers: Record<string, string> = { 'Content-Type': 'application/pdf' }
    if (disposition) headers['Content-Disposition'] = disposition
    return new Response(status === 200 ? '%PDF-1.7' : null, { status, headers })
  }

  it('fileTest', async () => {
    const calls = stubFetch(pdf(200, 'inline; filename="AU-2026-0001.pdf"'))

    const file = await api.file('/api/tenants/1/orders/7/pdf')

    expect(file.fileName).toBe('AU-2026-0001.pdf')
    expect(await file.blob.text()).toBe('%PDF-1.7')
    expect(calls[0].init.credentials).toBe('include')
  })

  it('fileWithUnquotedNameTest', async () => {
    stubFetch(pdf(200, 'inline; filename=AU-2026-0001.pdf'))

    await expect(api.file('/api/tenants/1/orders/7/pdf')).resolves.toMatchObject({
      fileName: 'AU-2026-0001.pdf',
    })
  })

  it('fileWithoutADispositionFallsBackToThePathTest', async () => {
    stubFetch(pdf(200))

    await expect(api.file('/api/tenants/1/orders/7/pdf')).resolves.toMatchObject({
      fileName: 'pdf',
    })
  })

  it('fileWithoutSessionTest', async () => {
    stubFetch(pdf(401))

    await expect(api.file('/api/tenants/1/orders/7/pdf')).rejects.toBeInstanceOf(
      UnauthorizedError,
    )
  })

  it('fileWithoutPermissionTest', async () => {
    stubFetch(json(403, undefined))

    await expect(api.file('/api/tenants/1/orders/7/pdf')).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
    })
  })

  it('fileReportsTheBackendMessageTest', async () => {
    stubFetch(json(409, { detail: 'document 7 is still a draft; issue it first' }))

    await expect(api.file('/api/tenants/1/invoices/7/qr-bill')).rejects.toThrow(
      'document 7 is still a draft; issue it first',
    )
  })
})

describe('ApiError', () => {
  it('apiErrorKeepsTheStatusTest', () => {
    const error = new ApiError(409, 'Der Datensatz wurde zwischenzeitlich geändert.')

    expect(error.status).toBe(409)
    expect(error.name).toBe('ApiError')
  })
})
