"use client";

import { Suspense } from "react";
import { BallotScanningContent } from "./BallotScanningContent";

export default function BallotScanningPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-600">Loading scanner…</div>}>
      <BallotScanningContent />
    </Suspense>
  );
}
