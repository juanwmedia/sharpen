import { register } from 'node:module'

// Lets tsx (server) resolve scenario markdown the same way Vite does.
register('./md-loader.mjs', import.meta.url)
