/**
 * Thin client for the webux-office REST API.
 *
 * <p>Authentication hangs on a session cookie, so every request goes out with
 * `credentials: 'include'`, and a write carries the CSRF token from the `XSRF-TOKEN` cookie
 * in the `X-XSRF-TOKEN` header. Keeping that in one place is the reason no component ever
 * calls `fetch` itself.
 */

/** Thrown when the backend answers 401, meaning the session is gone or was never there. */
export class UnauthorizedError extends Error {
  constructor() {
    super('Nicht angemeldet')
    this.name = 'UnauthorizedError'
  }
}

/** Thrown for any other error status, carrying a message meant for the user. */
export class ApiError extends Error {
  readonly status: number
  readonly details?: unknown

  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

function readCookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  const csrfToken = readCookie('XSRF-TOKEN')
  if (csrfToken && method !== 'GET') headers['X-XSRF-TOKEN'] = decodeURIComponent(csrfToken)

  const response = await fetch(path, {
    method,
    headers,
    credentials: 'include',
    signal: options.signal,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  if (response.status === 401) throw new UnauthorizedError()
  if (response.status === 204) return undefined as T

  const payload = await readPayload(response)
  if (!response.ok) {
    throw new ApiError(response.status, messageFor(response.status, payload), payload)
  }
  return payload as T
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Digs the backend explanation out of an error body.
 *
 * <p>Domain rules answer as RFC 9457 `ProblemDetail`, where the sentence sits in `detail`.
 * That is the one worth showing, because it names the rule that was broken. `message` is
 * checked as well for the plain Spring error body.
 */
function detailOf(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const body = payload as { detail?: unknown; message?: unknown }
  return String(body.detail ?? body.message ?? '')
}

/**
 * Turns an error status into a sentence the user can act on.
 *
 * <p>The backend explanation wins when there is one; the fallbacks only cover the cases
 * where it answers with a bare status.
 */
function messageFor(status: number, payload: unknown): string {
  const detail = detailOf(payload)
  if (detail) return detail
  switch (status) {
    case 400:
      return 'Die Eingabe wurde nicht akzeptiert.'
    case 403:
      return 'Dafür fehlt die Berechtigung.'
    case 404:
      return 'Nicht gefunden.'
    case 409:
      return 'Der Datensatz wurde zwischenzeitlich geändert.'
    default:
      return status >= 500 ? 'Das Backend meldet einen Fehler.' : `Fehler ${status}`
  }
}

/** A file the backend handed out, together with the name it gave it. */
export type ApiFile = {
  blob: Blob
  fileName: string
}

/**
 * Fetches a file, for example the PDF of a document.
 *
 * <p>Goes through the same client as everything else rather than pointing a link at the URL:
 * that keeps the handling of an expired session in one place. A link would open a new tab
 * showing a bare 401 instead of sending the user to the login screen.
 *
 * <p>With a body it becomes a POST, which is what a preview needs: the form being drawn is
 * not stored anywhere yet, so it travels in the request.
 *
 * @param path the endpoint that answers with the file
 * @param body what to send, omitted for a plain download
 * @returns the bytes and the file name the backend proposed
 */
async function requestFile(path: string, body?: unknown): Promise<ApiFile> {
  const headers: Record<string, string> = {}
  const csrfToken = readCookie('XSRF-TOKEN')
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    if (csrfToken) headers['X-XSRF-TOKEN'] = decodeURIComponent(csrfToken)
  }

  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (response.status === 401) throw new UnauthorizedError()
  if (!response.ok) {
    const payload = await readPayload(response)
    throw new ApiError(response.status, messageFor(response.status, payload), payload)
  }
  return {
    blob: await response.blob(),
    fileName: fileNameOf(response.headers.get('Content-Disposition'), path),
  }
}

/**
 * Sends a file the other way, as `multipart/form-data`.
 *
 * <p>Deliberately not through {@link request}: that one sets `Content-Type: application/json`
 * and stringifies the body. A multipart request must set <b>no</b> `Content-Type` at all —
 * the browser has to add it itself, because only it knows the boundary it just generated.
 * Setting the header by hand is the classic way to a 500 nobody can explain.
 *
 * <p>The CSRF token travels the same way as on any other write, and so does the session
 * cookie: an upload is a write like any other.
 *
 * @param path the endpoint that takes the file
 * @param file what to send
 * @param field name of the form part, `file` unless the endpoint says otherwise
 * @returns what the backend answered
 */
async function upload<T>(path: string, file: File, field = 'file'): Promise<T> {
  const form = new FormData()
  form.append(field, file)

  const headers: Record<string, string> = {}
  const csrfToken = readCookie('XSRF-TOKEN')
  if (csrfToken) headers['X-XSRF-TOKEN'] = decodeURIComponent(csrfToken)

  const response = await fetch(path, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: form,
  })

  if (response.status === 401) throw new UnauthorizedError()
  const payload = await readPayload(response)
  if (!response.ok) {
    throw new ApiError(response.status, messageFor(response.status, payload), payload)
  }
  return payload as T
}
/**
 * Reads the file name out of the `Content-Disposition` header.
 *
 * @param disposition the header, `null` when the backend sent none
 * @param path the request path, whose last segment is the fallback name
 * @returns the file name, never empty
 */
function fileNameOf(disposition: string | null, path: string): string {
  const quoted = disposition?.match(/filename="([^"]+)"/)?.[1]
  const bare = disposition?.match(/filename=([^;]+)/)?.[1]?.trim()
  return quoted ?? bare ?? (path.split('/').pop() || 'download')
}

/** The only way into the backend. */
export const api = {
  get: <T,>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  file: (path: string, body?: unknown) => requestFile(path, body),
  post: <T,>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  upload: <T,>(path: string, file: File, field?: string) => upload<T>(path, file, field),
  put: <T,>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T,>(path: string) => request<T>(path, { method: 'DELETE' }),
}
