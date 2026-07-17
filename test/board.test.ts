import { describe, expect, it } from 'vitest'
import { createArena } from '../engine/arena.ts'
import { BOARD_LINE, formatBoard } from '../engine/board.ts'
import cleanSweep from '../scenarios/git/clean-sweep/index.ts'

describe('formatBoard', () => {
  it('summarizes Clean sweep initial mess', async () => {
    const arena = await createArena(cleanSweep)
    const board = formatBoard(await arena.snapshot())
    expect(board).toContain(`${BOARD_LINE.branch}: main`)
    expect(board).toMatch(new RegExp(`${BOARD_LINE.untracked}:.*build\\.log`))
    expect(board).toMatch(new RegExp(`${BOARD_LINE.modified}:.*src\\/api\\/client\\.ts`))
    expect(board).toContain(`${BOARD_LINE.staged}: (none)`)
  })
})
