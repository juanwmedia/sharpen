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
  picker: {
    eyebrow: 'git pack',
    title: 'Pick your challenge',
    lede: '60 seconds on the clock, a real repo in your browser, a Socratic mentor watching. Every {enter} validates: run a command and the arena judges the repo state it leaves behind. Any correct solution passes.',
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
    greetingTagline: 'The repo is real. The clock is not your friend. Every Enter validates.',
    shellTip: 'That is the shell, not the mentor. Ask the mentor in the conversation below; every Enter validates your repo state.',
    solved: '✓ Challenge solved. The arena validated your repo state.',
    notYetQuiet: '✗ not yet: {green}/{total} checks green',
    notYetLoud: '✗ Not yet. Check the verdict panel. The mentor has a hint.',
    alreadySolved: 'Already solved. Ask the mentor below, or go back for the next challenge.',
    timeUp: 'Time is up. The mentor is teaching. You can keep experimenting.',
    timeout: '⏱ {seconds} seconds are gone. Mentor incoming, and you can keep typing.',
    runLost: 'The arena server restarted and this run is gone. Taking you back to the challenges…',
  },
  chat: {
    eyebrow: 'conversation',
    idle: "Your commands and the mentor's replies land here as a conversation. While the clock runs the mentor only nudges, never spoils; when it ends, it teaches.",
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
  verdict: {
    eyebrow: 'verdict',
    pending: 'Validate to see the checks.',
  },
  player: {
    profileTitle: "Open {player}'s GitHub profile",
  },
}
