import { describe, expect, it } from 'vitest'
import { createArena } from '../engine/arena.ts'
import { scenarios } from '../scenarios/index.ts'

// The dry-run validator: every registered scenario must (a) not be born
// solved and (b) be solvable by its own canonical solution, with every check
// green. This is the whole admission bar a distributed scenario has to clear,
// so it runs on the exact same engine as the game.
describe('scenario dry-run: setup fails, solution passes', () => {
  for (const scenario of scenarios) {
    it(`${scenario.id} v${scenario.version}`, async () => {
      const arena = await createArena(scenario)

      const initial = await arena.verdict()
      expect(initial.pass, 'a fresh scenario must not be already solved').toBe(false)

      for (const command of scenario.solution) {
        const result = await arena.exec(command)
        expect(result.exitCode, `solution command failed: ${command}\n${result.stderr}`).toBe(0)
      }

      const final = await arena.verdict()
      expect(
        final.checks.filter((c) => !c.pass).map((c) => c.name.en),
        'every check must pass after the canonical solution'
      ).toEqual([])
      expect(final.pass).toBe(true)
    })
  }
})
