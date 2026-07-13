import { statusOf, untrackedFiles } from '../../engine/snapshot.ts'
import type { Challenge, Check } from '../../engine/types.ts'

const DIRTY_CLIENT = `export async function fetchNotes(patientId: string) {
  const response = await fetch(\`/api/notes/\${patientId}\`)
  if (!response.ok) throw new Error('notes fetch failed')
  return response.json()
}
`

export default {
  id: 'git/clean-sweep',
  pack: 'git',
  title: 'Clean sweep',
  difficulty: 'medium',
  timeLimitMs: 60_000,
  statement:
    'Your working tree mixes real work in progress with debug junk. ' +
    'Get rid of every untracked file and directory. ' +
    'The modified tracked file must keep its changes, nothing may be staged, ' +
    'and history must stay untouched.',
  // Commands the mentor may reference in hints. The porcelain itself decides
  // what runs; this list feeds the challenge UI and the mentor prompt.
  focusCommands: ['git status', 'git clean'],
  // Canonical solution, ONLY surfaced by the mentor after the timer expires.
  walkthrough:
    'git clean -nd first: it lists what would be swept (build.log, notes/, tmp/) without touching anything. ' +
    'Then git clean -fd: -f actually removes untracked files, -d extends the sweep to untracked directories. ' +
    'git clean never touches tracked files, so the modified src/api/client.ts keeps its changes. ' +
    'Plain rm -rf on the junk paths is equally valid: the arena checks the resulting state, not the commands.',

  async setup(env) {
    await env.write(
      'src/api/client.ts',
      `export async function fetchNotes(patientId: string) {
  const response = await fetch(\`/api/notes/\${patientId}\`)
  return response.json()
}
`
    )
    await env.write('src/index.ts', `export { fetchNotes } from './api/client'\n`)
    await env.write('README.md', '# noa-notes\n\nPatient notes client.\n')
    await env.add('src/api/client.ts', 'src/index.ts', 'README.md')
    await env.commit('feat: initial notes client')

    await env.write('src/api/retry.ts', `export const MAX_RETRIES = 3\n`)
    await env.add('src/api/retry.ts')
    await env.commit('feat: add retry policy')

    // The mess: one real change to keep, junk to sweep.
    await env.write('src/api/client.ts', DIRTY_CLIENT)
    await env.write('tmp/debug.log', 'GET /api/notes/42 200 12ms\n')
    await env.write('tmp/cache.json', '{"stale":true}\n')
    await env.write('notes/ideas.md', '- try exponential backoff\n')
    await env.write('build.log', 'webpack compiled with 1 warning\n')
  },

  async assert({ snapshot, fs, dir }) {
    const checks: Check[] = []

    const untracked = untrackedFiles(snapshot)
    checks.push({
      name: 'No untracked files remain',
      pass: untracked.length === 0,
      detail: untracked.length ? `still untracked: ${untracked.join(', ')}` : 'working tree has no junk left',
    })

    const clientState = statusOf(snapshot, 'src/api/client.ts')
    let clientContent = ''
    try {
      clientContent = await fs.readFile(`${dir}/src/api/client.ts`, 'utf8')
    } catch {
      clientContent = ''
    }
    checks.push({
      name: 'Work in progress survived, unstaged',
      pass: clientState === 'modified' && clientContent === DIRTY_CLIENT,
      detail:
        clientState === 'modified'
          ? 'src/api/client.ts still carries your uncommitted change'
          : `src/api/client.ts is ${clientState} (expected: modified, unstaged)`,
    })

    const staged = snapshot.status.some(([, , , stage]) => stage >= 2)
    checks.push({
      name: 'Nothing staged',
      pass: !staged,
      detail: staged ? 'the index is not clean' : 'index untouched',
    })

    checks.push({
      name: 'History untouched on main',
      pass: snapshot.head.branch === 'main' && snapshot.log.length === 2,
      detail: `HEAD is ${snapshot.head.branch} with ${snapshot.log.length} commits (expected main with 2)`,
    })

    return { pass: checks.every((c) => c.pass), checks }
  },
} satisfies Challenge
