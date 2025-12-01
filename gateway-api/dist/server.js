"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/server.ts
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const fabricClient_1 = require("./fabricClient");
const app = (0, express_1.default)();
app.use(body_parser_1.default.json());
// Simple health-check
app.get('/health', (_req, res) => {
    res.json({ ok: true });
});
// 1) Get election details
app.get('/elections/:id', async (req, res) => {
    try {
        const contract = await (0, fabricClient_1.getContract)();
        const bytes = await contract.evaluateTransaction('GetElection', req.params.id);
        res.json(JSON.parse(bytes.toString()));
    }
    catch (err) {
        console.error(err);
        res.status(400).json({ error: err.message || 'GetElection failed' });
    }
});
// 2) Get candidates for a position
app.get('/elections/:id/positions/:positionId/candidates', async (req, res) => {
    const { id, positionId } = req.params;
    try {
        const contract = await (0, fabricClient_1.getContract)();
        const bytes = await contract.evaluateTransaction('GetCandidatesByPosition', id, positionId);
        res.json(JSON.parse(bytes.toString()));
    }
    catch (err) {
        console.error(err);
        res.status(400).json({ error: err.message || 'GetCandidatesByPosition failed' });
    }
});
// 3) Register voter
app.post('/elections/:id/voters', async (req, res) => {
    const { id } = req.params;
    const { voterId } = req.body; // e.g., UP mail or student ID
    if (!voterId) {
        return res.status(400).json({ error: 'voterId is required' });
    }
    try {
        const contract = await (0, fabricClient_1.getContract)();
        await contract.submitTransaction('RegisterVoter', id, voterId);
        res.json({ ok: true });
    }
    catch (err) {
        console.error(err);
        res.status(400).json({ error: err.message || 'RegisterVoter failed' });
    }
});
// 4) Cast vote
app.post('/elections/:id/votes', async (req, res) => {
    const { id } = req.params;
    const { voterId, selections } = req.body;
    // selections = [{ positionId, candidateId }, ...]
    if (!voterId || !Array.isArray(selections)) {
        return res.status(400).json({ error: 'voterId and selections[] are required' });
    }
    try {
        const contract = await (0, fabricClient_1.getContract)();
        const selectionsJson = JSON.stringify(selections);
        await contract.submitTransaction('CastVote', id, voterId, selectionsJson);
        res.json({ ok: true });
    }
    catch (err) {
        console.error(err);
        res.status(400).json({ error: err.message || 'CastVote failed' });
    }
});
// 5) Get results
app.get('/elections/:id/results', async (req, res) => {
    const { id } = req.params;
    try {
        const contract = await (0, fabricClient_1.getContract)();
        const bytes = await contract.evaluateTransaction('GetElectionResults', id);
        res.json(JSON.parse(bytes.toString()));
    }
    catch (err) {
        console.error(err);
        res.status(400).json({ error: err.message || 'GetElectionResults failed' });
    }
});
const PORT = process.env.PORT || 4000;
async function main() {
    app.listen(PORT, () => {
        console.log(`eCASVote gateway API listening on http://localhost:${PORT}`);
    });
}
main().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
