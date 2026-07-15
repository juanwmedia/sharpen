// Spanish UI copy. Mirrors en.ts key for key (guarded by test/i18n.test.ts).
// Challenge content stays in English on purpose: git speaks English.
export default {
  app: {
    engine: 'engine {version}',
  },
  lang: {
    label: 'Idioma',
  },
  mode: {
    label: 'Modo de juego',
    learn: 'aprender',
    challenge: 'desafío',
  },
  picker: {
    eyebrow: 'pack de git',
    title: 'Elige tu escenario',
    ledeLearn:
      'Sin reloj, un repo real en tu navegador y un mentor socrático observando. Cada {enter} valida: ejecuta un comando y la arena juzga el estado del repo que deja detrás. Desvela la solución cuando quieras el walkthrough.',
    ledeChallenge:
      '60 segundos en el reloj, un repo real en tu navegador y un mentor socrático observando. Cada {enter} valida: ejecuta un comando y la arena juzga el estado del repo que deja detrás. Cualquier solución correcta pasa.',
    meta: '{pack} · {difficulty} · {seconds}s',
    enterArena: '→ entra en la arena',
  },
  difficulty: {
    easy: 'fácil',
    medium: 'media',
    hard: 'difícil',
  },
  board: {
    eyebrow: 'clasificación',
    title: 'Los más afilados hoy',
    empty: 'Aún no hay intentos. Sé la primera hoja en pasar por la piedra.',
    rank: '#',
    engineer: 'ingeniero',
    score: 'puntos',
    solved: 'resueltos',
    best: 'mejor',
  },
  arena: {
    back: 'Volver a los escenarios',
  },
  scenario: {
    briefing: 'Situación',
    objective: 'Objetivo',
  },
  briefingModal: {
    start: 'Empezar desafío',
    back: 'Volver a los escenarios',
  },
  terminal: {
    // {'@'} escapes the bare @, which intlify parses as a linked message.
    title: "you{'@'}sharpen · /repo",
    hint: 'cada {enter} valida',
    pin: 'Fijar el terminal (siempre visible)',
    unpin: 'Soltar el terminal (se desplaza con la página)',
    greetingTagline: 'El repo es real. Cada Enter valida.',
    shellTip: 'Esto es la shell, no el mentor. Pregunta al mentor en la conversación de abajo; cada Enter valida el estado de tu repo.',
    solved: '✓ Escenario resuelto. La arena validó el estado de tu repo.',
    notYetQuiet: '✗ todavía no: {green}/{total} checks en verde',
    notYetLoud: '✗ Todavía no. Mira el panel de veredicto. El mentor tiene una pista.',
    alreadySolved: 'Ya está resuelto. Pregunta al mentor abajo o vuelve a por el siguiente escenario.',
    timeUp: 'Solución desvelada. El mentor está enseñando. Puedes seguir experimentando.',
    timeout: '⏱ Los {seconds} segundos se han ido. El mentor llega ahora, y puedes seguir tecleando.',
    revealed: 'Solución desvelada. El mentor está enseñando. Puedes seguir experimentando.',
    restored: 'Restaurados {count} comandos de la última sesión.',
    runLost: 'El servidor de la arena se reinició y este intento se ha perdido. Te llevo de vuelta a los escenarios…',
  },
  chat: {
    eyebrow: 'conversación',
    idle: 'Tus comandos y las respuestas del mentor aparecen aquí como una conversación. Mientras practicas el mentor solo da empujones, nunca destripa; después de un desvelado o un acierto, enseña.',
    placeholderLive: 'Pide un empujón…',
    placeholderFree: 'Pregunta lo que quieras al mentor…',
    send: 'Enviar',
    thinking: 'pensando…',
  },
  mentorError: {
    budget: 'El mentor ha alcanzado su límite de turnos en este intento.',
    busy: 'Una pregunta cada vez: el mentor todavía está respondiendo.',
    unavailable: 'El mentor no está disponible: instala y autentica Claude Code para activarlo.',
    failed: 'El mentor ha fallado en ese turno. Prueba otra vez.',
  },
  timer: {
    ready: 'prepárate',
    live: 'en vivo',
    notYet: 'todavía no',
    solved: 'resuelto',
    timeout: 'tiempo agotado',
  },
  learn: {
    eyebrow: 'modo aprender',
    ready: 'listo',
    practicing: 'practicando',
    solved: 'resuelto',
    revealed: 'desvelado',
    reveal: 'Desvelar solución',
    wipe: 'Borrar progreso',
  },
  revealModal: {
    title: '¿Desvelar la solución?',
    body: 'El mentor te explicará el enfoque canónico. Puedes seguir tecleando después, pero se acaba el guardrail socrático.',
    confirm: 'Desvelar',
    cancel: 'Seguir intentando',
  },
  wipeModal: {
    title: '¿Borrar el progreso de aprender?',
    body: 'Esto limpia los comandos y la conversación del mentor guardados para este escenario. El modo desafío no se ve afectado.',
    confirm: 'Borrar y reiniciar',
    cancel: 'Conservar progreso',
  },
  verdict: {
    eyebrow: 'veredicto',
    loading: 'Cargando checks…',
  },
  player: {
    profileTitle: 'Abrir el perfil de GitHub de {player}',
  },
}
