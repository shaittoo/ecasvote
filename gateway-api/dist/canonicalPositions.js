"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CANONICAL_POSITION_IDS = exports.STANDARD_CAS_SC_POSITIONS = void 0;
exports.ensureCanonicalPositionsInPrisma = ensureCanonicalPositionsInPrisma;
exports.registerCanonicalPositionsOnChainForElection = registerCanonicalPositionsOnChainForElection;
exports.resolveCanonicalPositionId = resolveCanonicalPositionId;
/**
 * Canonical CAS SC ballot positions — one global row per id, shared by all elections.
 * IDs must match chaincode / Fabric AddPosition + RegisterCandidate.
 */
const prismaClient_1 = require("./prismaClient");
exports.STANDARD_CAS_SC_POSITIONS = [
    { id: 'usc-councilor', name: 'USC Councilor', maxVotes: 3, order: 1 },
    { id: 'cas-rep-usc', name: 'CAS Rep. to the USC', maxVotes: 1, order: 2 },
    { id: 'cas-chairperson', name: 'CAS Chairperson', maxVotes: 1, order: 3 },
    { id: 'cas-vice-chairperson', name: 'CAS Vice Chairperson', maxVotes: 1, order: 4 },
    { id: 'cas-councilor', name: 'CAS Councilor', maxVotes: 5, order: 5 },
    { id: 'clovers-governor', name: 'Clovers Governor', maxVotes: 1, order: 6 },
    { id: 'elektrons-governor', name: 'Elektrons Governor', maxVotes: 1, order: 7 },
    { id: 'redbolts-governor', name: 'Redbolts Governor', maxVotes: 1, order: 8 },
    { id: 'skimmers-governor', name: 'Skimmers Governor', maxVotes: 1, order: 9 },
];
exports.CANONICAL_POSITION_IDS = new Set(exports.STANDARD_CAS_SC_POSITIONS.map((p) => p.id));
/** Lowercase display / alias label -> canonical position id */
const DISPLAY_OR_ALIAS_TO_ID = (() => {
    const m = {};
    for (const p of exports.STANDARD_CAS_SC_POSITIONS) {
        m[p.id.toLowerCase()] = p.id;
        m[p.name.trim().toLowerCase()] = p.id;
    }
    m['cas representative to the usc'] = 'cas-rep-usc';
    m['cas rep to the usc'] = 'cas-rep-usc';
    return m;
})();
/** Upsert all standard rows in Prisma (no per-election rows). */
async function ensureCanonicalPositionsInPrisma() {
    for (const pos of exports.STANDARD_CAS_SC_POSITIONS) {
        await prismaClient_1.prisma.position.upsert({
            where: { id: pos.id },
            update: {
                name: pos.name,
                maxVotes: pos.maxVotes,
                order: pos.order,
            },
            create: {
                id: pos.id,
                name: pos.name,
                maxVotes: pos.maxVotes,
                order: pos.order,
            },
        });
    }
}
/** Register each canonical position on the ledger for a specific election (idempotent). */
async function registerCanonicalPositionsOnChainForElection(contract, electionId) {
    for (const pos of exports.STANDARD_CAS_SC_POSITIONS) {
        try {
            await contract.submitTransaction('AddPosition', electionId, pos.id, pos.name, String(pos.maxVotes), String(pos.order));
        }
        catch (chainErr) {
            const msg = chainErr instanceof Error ? chainErr.message : String(chainErr);
            if (!msg.includes('already exists')) {
                throw chainErr;
            }
        }
    }
}
/**
 * Resolve API input to a canonical position id.
 * Accepts official id, display name, common aliases, or legacy composite ids (…__slug).
 */
function resolveCanonicalPositionId(input) {
    const rawId = String(input.positionId ?? '').trim();
    if (rawId) {
        if (exports.CANONICAL_POSITION_IDS.has(rawId))
            return rawId;
        if (rawId.includes('__')) {
            const suffix = rawId.slice(rawId.lastIndexOf('__') + 2);
            if (exports.CANONICAL_POSITION_IDS.has(suffix))
                return suffix;
        }
        const byIdAlias = DISPLAY_OR_ALIAS_TO_ID[rawId.toLowerCase()];
        if (byIdAlias)
            return byIdAlias;
    }
    const rawName = String(input.positionName ?? '').trim();
    if (!rawName)
        return null;
    const fromMap = DISPLAY_OR_ALIAS_TO_ID[rawName.toLowerCase()];
    if (fromMap)
        return fromMap;
    if (rawName.includes('__')) {
        const suffix = rawName.slice(rawName.lastIndexOf('__') + 2);
        if (exports.CANONICAL_POSITION_IDS.has(suffix))
            return suffix;
    }
    return null;
}
