// Spanish UI copy. Mirrors en.ts key for key (guarded by test/i18n.test.ts).
// Challenge content stays in English on purpose: git speaks English.
export default {
  app: {
    engine: 'engine {version}',
  },
  lang: {
    label: 'Idioma',
  },
  picker: {
    eyebrow: 'pack de git',
    title: 'Elige tu desafío',
    lede: '60 segundos en el reloj, un repo real en tu navegador y un mentor socrático observando. Cada {enter} valida: ejecuta un comando y la arena juzga el estado del repo que deja detrás. Cualquier solución correcta pasa.',
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
    back: 'Volver a los desafíos',
  },
  terminal: {
    // {'@'} escapes the bare @, which intlify parses as a linked message.
    title: "you{'@'}sharpen · /repo",
    hint: 'cada {enter} valida',
    pin: 'Fijar el terminal (siempre visible)',
    unpin: 'Soltar el terminal (se desplaza con la página)',
    greetingTagline: 'El repo es real. El reloj no es tu amigo. Cada Enter valida.',
    shellTip: 'Esto es la shell, no el mentor. Pregunta al mentor en la conversación de abajo; cada Enter valida el estado de tu repo.',
    solved: '✓ Desafío resuelto. La arena validó el estado de tu repo.',
    notYetQuiet: '✗ todavía no: {green}/{total} checks en verde',
    notYetLoud: '✗ Todavía no. Mira el panel de veredicto. El mentor tiene una pista.',
    alreadySolved: 'Ya está resuelto. Pregunta al mentor abajo o vuelve a por el siguiente desafío.',
    timeUp: 'Se acabó el tiempo. El mentor está enseñando. Puedes seguir experimentando.',
    timeout: '⏱ Los {seconds} segundos se han ido. El mentor llega ahora, y puedes seguir tecleando.',
    runLost: 'El servidor de la arena se reinició y este intento se ha perdido. Te llevo de vuelta a los desafíos…',
  },
  chat: {
    eyebrow: 'conversación',
    idle: 'Tus comandos y las respuestas del mentor aparecen aquí como una conversación. Mientras corre el reloj el mentor solo da empujones, nunca destripa; cuando termina, enseña.',
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
  verdict: {
    eyebrow: 'veredicto',
    pending: 'Valida para ver los checks.',
  },
  player: {
    profileTitle: 'Abrir el perfil de GitHub de {player}',
  },
}
