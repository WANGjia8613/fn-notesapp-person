import type { FastifyRequest, FastifyReply } from 'fastify'

export interface JwtPayload {
  userId: string
  workspaceId: string
  role: string
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload
  }
}

// 为 app.decorate('authenticate', ...) 做类型声明
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

// 路由级限流配置由 @fastify/rate-limit 自身声明的 FastifyContextConfig.rateLimit 提供，
// 这里不再重复声明（重复声明会导致 TS2717 类型冲突）
