import { InsufficientStockError } from '@mediflow/shared'
import { Prisma } from '@prisma/client'
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message)
  }
}
export const badRequest = (m: string) => new AppError(400, m)
export const notFound = (m = '记录不存在') => new AppError(404, m)
export const conflict = (m: string) => new AppError(409, m)
export const forbidden = (m = '没有权限') => new AppError(403, m)

export function errorHandler(err: FastifyError | Error, req: FastifyRequest, reply: FastifyReply) {
  if (err instanceof ZodError) {
    const first = err.issues[0]
    const path = first?.path.join('.')
    return reply.status(400).send({
      message: first ? `${first.message}${path ? `（${path}）` : ''}` : '参数错误',
      issues: err.issues,
    })
  }
  if (err instanceof InsufficientStockError) {
    return reply.status(409).send({ message: err.message })
  }
  if (err instanceof AppError) {
    return reply.status(err.statusCode).send({ message: err.message })
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return reply.status(409).send({ message: '编号或唯一字段已存在' })
    if (err.code === 'P2025') return reply.status(404).send({ message: '记录不存在' })
    if (err.code === 'P2003') return reply.status(409).send({ message: '存在关联数据，无法删除或修改' })
  }
  const fe = err as FastifyError
  if (fe.statusCode && fe.statusCode < 500) {
    return reply.status(fe.statusCode).send({ message: fe.message })
  }
  req.log.error(err)
  return reply.status(500).send({ message: '服务器内部错误：' + err.message })
}
