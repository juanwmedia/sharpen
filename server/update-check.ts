// Update notice v1: on boot the server asks GitHub which release is the
// latest published one. The release tag IS the source of truth (no separate
// version feed to drift out of sync: publishing the release is what flips
// the notice on). Best effort by design: any failure (offline, rate limit,
// timeout) resolves to null and the arena simply shows no notice. The check
// must never block or break a launch.
const LATEST_RELEASE_URL = 'https://api.github.com/repos/juanwmedia/sharpen/releases/latest'
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
    const res = await fetch(LATEST_RELEASE_URL, {
      signal: AbortSignal.timeout(VERSION_CHECK_TIMEOUT_MS),
      // GitHub's API rejects requests without a User-Agent.
      headers: { 'user-agent': 'sharpen-update-check', accept: 'application/vnd.github+json' },
    })
    if (!res.ok) return null
    const body = (await res.json()) as { tag_name?: unknown }
    const tag = typeof body.tag_name === 'string' ? body.tag_name : null
    const latest = tag && tag.startsWith('v') ? tag.slice(1) : tag
    return latest && isNewerVersion(latest, currentVersion) ? latest : null
  } catch {
    return null
  }
}
