import { app } from './app.ts'

const PORT = Number(process.env.SHARPEN_PORT ?? 4517)

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`sharpen listening on http://127.0.0.1:${PORT}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 1500).unref()
  })
}
