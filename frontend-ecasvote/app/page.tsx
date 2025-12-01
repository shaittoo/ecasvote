import Link from "next/link";
import { fetchElection, fetchResults } from '@/lib/ecasvoteApi';

const ELECTION_ID = 'election-2025';

export default async function HomePage() {
  let election;
  let results;
  let error: string | null = null;

  try {
    [election, results] = await Promise.all([
      fetchElection(ELECTION_ID),
      fetchResults(ELECTION_ID),
    ]);
  } catch (err: any) {
    error = err.message || 'Failed to load election data';
    console.error('Error loading election data:', err);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <h2 className="text-lg font-semibold text-red-900 mb-2">Error</h2>
            <p className="text-sm text-red-700">{error}</p>
            <Link
              href="/vote"
              className="inline-flex items-center rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow hover:bg-sky-400 mt-4"
            >
              Go to ballot
            </Link>
          </div>
        ) : (
          <>
            <header>
              <h1 className="text-3xl font-bold">
                eCASVote – {election?.name || 'Loading...'}
              </h1>
              {election && (
                <>
                  <p className="text-sm text-slate-600 mt-1">
                    Status: <span className="font-semibold">{election.status}</span>
                  </p>
                  <p className="mt-3 text-slate-700">
                    {election.description}
                  </p>
                </>
              )}
              <Link
                href="/vote"
                className="inline-flex items-center rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow hover:bg-sky-400 mt-4"
              >
                Go to ballot
              </Link>
            </header>

            <section className="bg-white shadow rounded-xl p-4">
              <h2 className="text-lg font-semibold mb-2">Raw results JSON</h2>
              <pre className="text-xs bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto">
                {JSON.stringify(results || {}, null, 2)}
              </pre>
              <p className="mt-2 text-xs text-slate-500">
                This is coming from the blockchain via the gateway API.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
