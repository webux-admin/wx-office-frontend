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

describe('ApiError', () => {
  it('apiErrorKeepsTheStatusTest', () => {
    const error = new ApiError(409, 'Der Datensatz wurde zwischenzeitlich geändert.')

    expect(error.status).toBe(409)
    expect(error.name).toBe('ApiError')
  })
})
