// src/prismaClient.ts
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
})

/**
 * With `{ adapter }`, some TS versions omit newer model delegates (e.g. `electionVoter`) from the
 * inferred client type. Intersecting restores access without losing other delegates.
 */
export const prisma = new PrismaClient({ adapter }) as PrismaClient & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- delegate type lives in generated client; adapter inference drops it in some IDEs
  electionVoter: any
}

export default prisma
