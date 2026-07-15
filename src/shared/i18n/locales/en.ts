// English UI copy. Default language. Challenge content (titles, statements,
// check names) is authored in English and is intentionally NOT translated:
// it is content, not chrome, and git itself speaks English.
export default {
  app: {
    engine: 'engine {version}',
  },
  lang: {
    label: 'Language',
  },
  mode: {
    label: 'Run mode',
    learn: 'learn',
    challenge: 'challenge',
  },
  picker: {
    eyebrow: 'git pack',
    title: 'Pick your challenge',
    ledeLearn:
      'No clock, a real repo in your browser, a Socratic mentor watching. Every {enter} validates: run a command and the arena judges the repo state it leaves behind. Reveal when you want the walkthrough.',
    ledeChallenge:
      '60 seconds on the clock, a real repo in your browser, a Socratic mentor watching. Every {enter} validates: run a command and the arena judges the repo state it leaves behind. Any correct solution passes.',
    meta: '{pack} · {difficulty} · {seconds}s',
    enterArena: '→ enter the arena',
  },
  difficulty: {
    easy: 'easy',
    medium: 'medium',
    hard: 'hard',
  },
  board: {
    eyebrow: 'leaderboard',
    title: 'Sharpest today',
    empty: 'No runs yet. Be the first blade on the stone.',
    rank: '#',
    engineer: 'engineer',
    score: 'score',
    solved: 'solved',
    best: 'best',
  },
  arena: {
    back: 'Back to challenges',
  },
  terminal: {
    // {'@'} is intlify's escape: a bare @ starts a linked message and breaks
    // the message compiler at render time.
    title: "you{'@'}sharpen · /repo",
    hint: 'every {enter} validates',
    pin: 'Pin terminal (stays visible)',
    unpin: 'Unpin terminal (scrolls with the page)',
    greetingTagline: 'The repo is real. Every Enter validates.',
    shellTip: 'That is the shell, not the mentor. Ask the mentor in the conversation below; every Enter validates your repo state.',
    solved: '✓ Challenge solved. The arena validated your repo state.',
    notYetQuiet: '✗ not yet: {green}/{total} checks green',
    notYetLoud: '✗ Not yet. Check the verdict panel. The mentor has a hint.',
    alreadySolved: 'Already solved. Ask the mentor below, or go back for the next challenge.',
    timeUp: 'Solution revealed. The mentor is teaching. You can keep experimenting.',
    timeout: '⏱ {seconds} seconds are gone. Mentor incoming, and you can keep typing.',
    revealed: 'Solution revealed. The mentor is teaching. You can keep experimenting.',
    restored: 'Restored {count} commands from last session.',
    runLost: 'The arena server restarted and this run is gone. Taking you back to the challenges…',
  },
  chat: {
    eyebrow: 'conversation',
    idle: "Your commands and the mentor's replies land here as a conversation. While you practice the mentor only nudges, never spoils; after a reveal or a solve, it teaches.",
    placeholderLive: 'Ask for a nudge…',
    placeholderFree: 'Ask the mentor anything…',
    send: 'Send',
    thinking: 'thinking…',
  },
  mentorError: {
    budget: 'The mentor reached its turn budget for this run.',
    busy: 'One question at a time: the mentor is still answering.',
    unavailable: 'The mentor is unavailable: install and authenticate Claude Code to enable it.',
    failed: 'The mentor failed on that turn. Try again.',
  },
  timer: {
    ready: 'get ready',
    live: 'live',
    notYet: 'not yet',
    solved: 'solved',
    timeout: 'time out',
  },
  learn: {
    eyebrow: 'learn mode',
    ready: 'ready',
    practicing: 'practicing',
    solved: 'solved',
    revealed: 'revealed',
    reveal: 'Reveal solution',
    wipe: 'Wipe progress',
  },
  revealModal: {
    title: 'Reveal the solution?',
    body: 'The mentor will walk you through the canonical approach. You can keep typing afterward, but the Socratic guardrail ends.',
    confirm: 'Reveal',
    cancel: 'Keep trying',
  },
  wipeModal: {
    title: 'Wipe learn progress?',
    body: 'This clears your saved commands and mentor conversation for this challenge. Challenge mode is unaffected.',
    confirm: 'Wipe and restart',
    cancel: 'Keep progress',
  },
  verdict: {
    eyebrow: 'verdict',
    loading: 'Loading checks…',
  },
  player: {
    profileTitle: "Open {player}'s GitHub profile",
  },
}
