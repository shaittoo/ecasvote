// src/prismaClient.ts
import { PrismaClient, Prisma } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
})

const prismaOptions: Prisma.PrismaClientOptions = { adapter }

export const prisma = new PrismaClient(prismaOptions)

export default prisma
