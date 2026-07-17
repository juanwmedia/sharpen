import { FILE_STATUS, statusOf, untrackedFiles } from '../../../engine/snapshot.ts'
import type { ScenarioAssertContext, Check } from '../../../engine/types.ts'
import { DIRTY_CLIENT } from './setup.ts'

export async function assert({
  snapshot,
  fs,
  dir,
}: ScenarioAssertContext): Promise<{ pass: boolean; checks: Check[] }> {
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
    pass: clientState === FILE_STATUS.modified && clientContent === DIRTY_CLIENT,
    detail:
      clientState === FILE_STATUS.modified
        ? {
            en: 'src/api/client.ts still carries your uncommitted change',
            es: 'src/api/client.ts conserva tu cambio sin commitear',
          }
        : {
            en: `src/api/client.ts is ${clientState} (expected: ${FILE_STATUS.modified}, unstaged)`,
            es: `src/api/client.ts está ${clientState} (esperado: ${FILE_STATUS.modified}, sin stage)`,
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
}
