import { FILE_STATUS, statusOf, untrackedFiles } from './snapshot.ts'
import type { Snapshot } from './types.ts'

const BOARD_NONE = '(none)'
const BOARD_DETACHED = 'DETACHED'
const DELETED_SUFFIX = ` (${FILE_STATUS.deleted})`

/** Line labels in formatBoard (mentor prompt / evidence-facing English). */
export const BOARD_LINE = {
  branch: 'branch',
  untracked: FILE_STATUS.untracked,
  modified: FILE_STATUS.modified,
  staged: FILE_STATUS.staged,
  other: FILE_STATUS.other,
} as const

function boardLine(label: string, entries: string[]): string {
  return `${label}: ${entries.length ? entries.join(', ') : BOARD_NONE}`
}

/** Compact working-tree summary for mentor prompts (English, paths only). */
export function formatBoard(snapshot: Snapshot): string {
  if (snapshot.files) {
    const paths = Object.keys(snapshot.files).sort()
    return [
      boardLine('workspace', ['ts']),
      boardLine('files', paths.length ? paths : [BOARD_NONE]),
    ].join('\n')
  }

  const branch = snapshot.head.branch ?? BOARD_DETACHED
  const untracked = untrackedFiles(snapshot)
  const modified: string[] = []
  const staged: string[] = []
  const other: string[] = []

  for (const [file] of snapshot.status) {
    const state = statusOf(snapshot, file)
    if (state === FILE_STATUS.untracked || state === FILE_STATUS.unmodified) continue
    if (state === FILE_STATUS.modified) modified.push(file)
    else if (state === FILE_STATUS.staged) staged.push(file)
    else if (state === FILE_STATUS.deleted) modified.push(`${file}${DELETED_SUFFIX}`)
    else if (state === FILE_STATUS.deletedStaged) staged.push(`${file}${DELETED_SUFFIX}`)
    else other.push(`${file} (${state})`)
  }

  const lines = [
    boardLine(BOARD_LINE.branch, [branch]),
    boardLine(BOARD_LINE.untracked, untracked),
    boardLine(BOARD_LINE.modified, modified),
    boardLine(BOARD_LINE.staged, staged),
  ]
  if (other.length) lines.push(boardLine(BOARD_LINE.other, other))
  return lines.join('\n')
}
