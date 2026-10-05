import { buildApp } from './app.js'
import { prisma } from './prisma.js'
import { config } from './config.js'

const port = config.port

async function main() {
  const app = buildApp()

  const shutdown = async (signal: string) => {
    app.log.info(`收到 ${signal}，正在优雅退出...`)
    try {
      await app.close()
      await prisma.$disconnect()
    } catch (err) {
      app.log.error(err)
    } finally {
      process.exit(0)
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  try {
    await app.listen({ port, host: '0.0.0.0' })
    app.log.info(`Server running on http://0.0.0.0:${port} (TZ=${config.timeZone})`)
    // 便于排查本地开发的配置来源：能看到 .env 是否真的被加载
    app.log.info(
      config.envFile
        ? `已加载环境文件: ${config.envFile}`
        : '未找到 .env 文件，全部配置来自进程环境变量',
    )
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

main()
