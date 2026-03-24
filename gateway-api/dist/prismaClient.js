"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
// src/prismaClient.ts
const client_1 = require("@prisma/client");
const adapter_better_sqlite3_1 = require("@prisma/adapter-better-sqlite3");
const adapter = new adapter_better_sqlite3_1.PrismaBetterSqlite3({
    url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
});
/**
 * With `{ adapter }`, some TS versions omit newer model delegates (e.g. `electionVoter`) from the
 * inferred client type. Intersecting restores access without losing other delegates.
 */
exports.prisma = new client_1.PrismaClient({ adapter });
exports.default = exports.prisma;
