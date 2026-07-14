// Single source of truth for the server API surface. Route builders keep
// fetch call sites free of hand-assembled strings.

export const apiRoutes = {
  meta: '/api/meta',
  challenges: '/api/challenges',
  leaderboard: '/api/leaderboard',
  runs: '/api/runs',
  run: (id: string) => `/api/runs/${id}`,
  runEvents: (id: string) => `/api/runs/${id}/events`,
  runStart: (id: string) => `/api/runs/${id}/start`,
  runCommand: (id: string) => `/api/runs/${id}/command`,
  runSubmit: (id: string) => `/api/runs/${id}/submit`,
  runAsk: (id: string) => `/api/runs/${id}/ask`,
  runExpire: (id: string) => `/api/runs/${id}/expire`,
} as const

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`)
  return (await res.json()) as T
}

export async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    ...(body !== undefined
      ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  })
  if (!res.ok) throw new Error(`POST ${url} failed: ${res.status}`)
  return (await res.json()) as T
}
