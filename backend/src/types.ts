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
