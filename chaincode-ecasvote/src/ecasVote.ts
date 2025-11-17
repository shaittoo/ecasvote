import { Context, Contract } from 'fabric-contract-api';

export interface Candidate {
    id: string;
    name: string;
    position: string;
    party: string;
}

export class ECASVoteContract extends Contract {

    public async InitLedger(ctx: Context): Promise<void> {
        console.info('ECASVote ledger initialized');
    }

    public async RegisterCandidate(
        ctx: Context,
        id: string,
        name: string,
        position: string,
        party: string
    ): Promise<void> {
        const exists = await this.CandidateExists(ctx, id);
        if (exists) {
            throw new Error(`Candidate ${id} already exists`);
        }

        const candidate: Candidate = { id, name, position, party };
        await ctx.stub.putState(id, new Uint8Array(Buffer.from(JSON.stringify(candidate))));
    }

    public async ReadCandidate(ctx: Context, id: string): Promise<string> {
        const data = await ctx.stub.getState(id);
        if (!data || data.length === 0) {
            throw new Error(`Candidate ${id} does not exist`);
        }
        return data.toString();
    }

    public async CandidateExists(ctx: Context, id: string): Promise<boolean> {
        const data = await ctx.stub.getState(id);
        return !!data && data.length > 0;
    }

    public async GetAllCandidates(ctx: Context): Promise<string> {
        const results: Candidate[] = [];

        const iterator = await ctx.stub.getStateByRange('', '');
        let res = await iterator.next();

        while (!res.done) {
            const value = new TextDecoder('utf8').decode(res.value.value);
            try {
                const candidate = JSON.parse(value);
                // very simple filter: assume anything with {id,name,position,party} is a candidate
                if (candidate.id && candidate.name && candidate.position) {
                    results.push(candidate);
                }
            } catch {
                // ignore non-candidate keys
            }
            res = await iterator.next();
        }

        await iterator.close();
        return JSON.stringify(results);
    }
}
