import type { ChallengeSetupEnv } from '../../../engine/types.ts'

export const DIRTY_CLIENT = `export async function fetchNotes(patientId: string) {
  const response = await fetch(\`/api/notes/\${patientId}\`)
  if (!response.ok) throw new Error('notes fetch failed')
  return response.json()
}
`

export async function setup(env: ChallengeSetupEnv): Promise<void> {
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
}
