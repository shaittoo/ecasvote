import { Suspense } from "react";
import { BallotPrintClient } from "./BallotPrintClient";

/**
 * Printable paper ballot (real gateway data).
 * - /admin/ballot-print
 * - /admin/ballot-print?electionId=election-2025
 */
export default function BallotPrintPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-100 p-8">
          <p className="text-gray-600">Loading…</p>
        </div>
      }
    >
      <BallotPrintClient />
    </Suspense>
  );
}
