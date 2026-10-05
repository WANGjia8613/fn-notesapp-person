import { buildApp } from './app.js'

const port = Number(process.env.PORT) || 3000

async function main() {
  const app = buildApp()
  try {
    await app.listen({ port, host: '0.0.0.0' })
    app.log.info(`Server running on http://0.0.0.0:${port}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

main()
