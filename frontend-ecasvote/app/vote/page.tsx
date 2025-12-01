// frontend-ecasvote/app/vote/page.tsx
"use client";

import { FormEvent, useState } from "react";
import { castVote, registerVoter, fetchElection, openElection } from "@/lib/ecasvoteApi";

const ELECTION_ID = "election-2025";

// For now we hardcode the single position/candidate that exists
const POSITION_ID = "chairperson";
const CANDIDATE_ID = "cand-chair-1";

export default function VotePage() {
  const [voterId, setVoterId] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState(CANDIDATE_ID);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    if (!voterId.trim()) {
      setErrorMessage("Please enter your voter ID (e.g. UP Mail or student ID).");
      return;
    }

    try {
      setIsSubmitting(true);

      // Check election status and open if needed
      const election = await fetchElection(ELECTION_ID);
      if (election.status !== 'OPEN') {
        if (election.status === 'DRAFT') {
          setErrorMessage("Election is not open yet. Opening election...");
          await openElection(ELECTION_ID);
          setErrorMessage(null);
        } else {
          throw new Error(`Election is ${election.status} and cannot accept votes.`);
        }
      }

      // Register voter if not already registered (will fail silently if already registered)
      try {
        await registerVoter(ELECTION_ID, voterId.trim());
      } catch (regErr: any) {
        // If already registered, that's fine - continue
        if (!regErr.message?.includes('already registered')) {
          console.warn('Registration warning:', regErr);
        }
      }

      // Cast the vote
      await castVote(ELECTION_ID, {
        voterId: voterId.trim(),
        selections: [
          {
            positionId: POSITION_ID,
            candidateId: selectedCandidate,
          },
        ],
      });

      setSuccessMessage("Your vote has been successfully recorded on the blockchain.");
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Failed to cast vote.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-900 flex justify-center px-4 py-10">
      <div className="w-full max-w-2xl bg-slate-950/70 border border-slate-800 rounded-2xl shadow-xl p-6 sm:p-8 text-slate-50">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-400 mb-2">
            eCASVote
          </p>
          <h1 className="text-2xl sm:text-3xl font-semibold mb-1">
            UPV CAS SC Elections 2025 – Ballot
          </h1>
          <p className="text-sm text-slate-400">
            This demo ballot writes directly to the Hyperledger Fabric
            network via the gateway API.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Voter ID */}
          <section>
            <label className="block text-sm font-medium text-slate-200 mb-1">
              Voter ID
            </label>
            <p className="text-xs text-slate-400 mb-2">
              For now, you can use any identifier (e.g. <code>voter123</code>).  
              In the real system this will be bound to UP Mail + student ID.
            </p>
            <input
              type="text"
              value={voterId}
              onChange={(e) => setVoterId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              placeholder="e.g. 2021-12345 or juan.delacruz@up.edu.ph"
            />
          </section>

          {/* Chairperson position */}
          <section>
            <h2 className="text-sm font-semibold text-slate-200 mb-1">
              Chairperson <span className="text-xs text-slate-400">(vote for 1)</span>
            </h2>

            <div className="mt-3 space-y-3">
              <label
                className="flex items-start gap-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 cursor-pointer hover:border-sky-500/80 transition"
              >
                <input
                  type="radio"
                  name="chairperson"
                  value={CANDIDATE_ID}
                  checked={selectedCandidate === CANDIDATE_ID}
                  onChange={() => setSelectedCandidate(CANDIDATE_ID)}
                  className="mt-1 h-4 w-4 text-sky-500 focus:ring-sky-500 border-slate-600 bg-slate-900"
                />
                <div>
                  <p className="text-sm font-medium">
                    Juan Dela Cruz{" "}
                    <span className="text-xs text-slate-400 align-middle">
                      – Party A
                    </span>
                  </p>
                  <p className="text-xs text-slate-400">
                    BS Computer Science, 4th year
                  </p>
                </div>
              </label>
            </div>
          </section>

          {/* Messages */}
          {successMessage && (
            <div className="rounded-lg border border-emerald-500/60 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              {successMessage}
            </div>
          )}
          {errorMessage && (
            <div className="rounded-lg border border-rose-500/60 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {errorMessage}
            </div>
          )}

          {/* Submit */}
          <div className="flex items-center justify-between pt-2">
            <a
              href="/"
              className="text-xs text-slate-400 hover:text-slate-200 underline-offset-2 hover:underline"
            >
              ← Back to results
            </a>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-md hover:bg-sky-400 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Submitting…" : "Cast vote"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
