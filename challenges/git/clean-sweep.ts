import { statusOf, untrackedFiles } from '../../engine/snapshot.ts'
import type { Challenge, Check } from '../../engine/types.ts'

const DIRTY_CLIENT = `export async function fetchNotes(patientId: string) {
  const response = await fetch(\`/api/notes/\${patientId}\`)
  if (!response.ok) throw new Error('notes fetch failed')
  return response.json()
}
`

const TREE = `repo/
├── README.md
├── build.log
├── notes/
│   └── ideas.md
├── src/
│   ├── index.ts
│   └── api/
│       ├── client.ts   (modified - keep)
│       └── retry.ts
└── tmp/
    ├── cache.json
    └── debug.log`

export default {
  id: 'git/clean-sweep',
  pack: 'git',
  title: 'Clean sweep',
  difficulty: 'medium',
  timeLimitMs: 60_000,
  briefing: {
    en:
      'You are in noa-notes, a small patient-notes client. ' +
      'Someone left real work in progress next to debug junk: logs, a scratch notes folder, and a tmp cache. ' +
      'The tracked edit in src/api/client.ts is intentional and must survive.',
    es:
      'Estás en noa-notes, un cliente pequeño de notas de pacientes. ' +
      'Alguien dejó trabajo real en curso junto a basura de depuración: logs, una carpeta notes de borrador y una caché en tmp. ' +
      'El cambio trackeado en src/api/client.ts es intencional y tiene que sobrevivir.',
  },
  tree: TREE,
  objective: {
    en:
      'Remove every untracked file and directory. ' +
      'Keep the modifications in src/api/client.ts. ' +
      'Leave nothing staged, and keep history on main untouched.',
    es:
      'Elimina todos los archivos y directorios sin seguimiento. ' +
      'Conserva las modificaciones de src/api/client.ts. ' +
      'No dejes nada en el stage y mantén el historial en main intacto.',
  },
  // Concept chips: domain vocabulary, never the solving command.
  themes: ['working tree', 'untracked', 'tracked', 'staging'],
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
      name: {
        en: 'No untracked files remain',
        es: 'No queda ningún archivo sin seguimiento',
      },
      pass: untracked.length === 0,
      detail: untracked.length
        ? {
            en: `still untracked: ${untracked.join(', ')}`,
            es: `todavía sin seguimiento: ${untracked.join(', ')}`,
          }
        : {
            en: 'working tree has no junk left',
            es: 'el working tree ya no tiene basura',
          },
    })

    const clientState = statusOf(snapshot, 'src/api/client.ts')
    let clientContent = ''
    try {
      clientContent = await fs.readFile(`${dir}/src/api/client.ts`, 'utf8')
    } catch {
      clientContent = ''
    }
    checks.push({
      name: {
        en: 'Work in progress survived, unstaged',
        es: 'El trabajo en curso sobrevivió, fuera del stage',
      },
      pass: clientState === 'modified' && clientContent === DIRTY_CLIENT,
      detail:
        clientState === 'modified'
          ? {
              en: 'src/api/client.ts still carries your uncommitted change',
              es: 'src/api/client.ts conserva tu cambio sin commitear',
            }
          : {
              en: `src/api/client.ts is ${clientState} (expected: modified, unstaged)`,
              es: `src/api/client.ts está ${clientState} (esperado: modified, sin stage)`,
            },
    })

    const staged = snapshot.status.some(([, , , stage]) => stage >= 2)
    checks.push({
      name: {
        en: 'Nothing staged',
        es: 'Nada en el stage',
      },
      pass: !staged,
      detail: staged
        ? { en: 'the index is not clean', es: 'el índice no está limpio' }
        : { en: 'index untouched', es: 'índice intacto' },
    })

    checks.push({
      name: {
        en: 'History untouched on main',
        es: 'Historial intacto en main',
      },
      pass: snapshot.head.branch === 'main' && snapshot.log.length === 2,
      detail: {
        en: `HEAD is ${snapshot.head.branch} with ${snapshot.log.length} commits (expected main with 2)`,
        es: `HEAD es ${snapshot.head.branch} con ${snapshot.log.length} commits (esperado main con 2)`,
      },
    })

    return { pass: checks.every((c) => c.pass), checks }
  },
} satisfies Challenge
