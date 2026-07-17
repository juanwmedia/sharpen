// Update notice v1: on boot the server asks a static JSON on frontendleap.com
// which version is the latest published release. Best effort by design: any
// failure (offline, 404 while FL has not published the file yet, timeout)
// resolves to null and the arena simply shows no notice. The check must never
// block or break a launch.
const VERSION_CHECK_URL = 'https://frontendleap.com/sharpen/version.json'
const VERSION_CHECK_TIMEOUT_MS = 2500

/** True when `a` is a strictly newer x.y.z than `b`. Anything unparsable is
 * never "newer": a malformed feed must not paint the update chip. */
export function isNewerVersion(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  if ([...pa, ...pb].some((n) => !Number.isInteger(n) || n < 0)) return false
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) return da > db
  }
  return false
}

/** Resolve the newer published version, or null. Called once per server
 * lifetime; /api/meta awaits the shared promise. */
export async function checkForUpdate(currentVersion: string): Promise<string | null> {
  // Hermetic escape hatches: tests and the release smoke boot must not
  // depend on the network.
  if (process.env.VITEST || process.env.SHARPEN_NO_UPDATE_CHECK === '1') return null
  try {
    const res = await fetch(VERSION_CHECK_URL, { signal: AbortSignal.timeout(VERSION_CHECK_TIMEOUT_MS) })
    if (!res.ok) return null
    const body = (await res.json()) as { latest?: unknown }
    const latest = typeof body.latest === 'string' ? body.latest : null
    return latest && isNewerVersion(latest, currentVersion) ? latest : null
  } catch {
    return null
  }
}
