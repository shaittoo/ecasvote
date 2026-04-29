"use client";

import { Suspense } from "react";
import { ElectionSelector } from "./components/ElectionSelector";

export default function BallotScanningPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-600">Loading…</div>}>
      <ElectionSelector />
    </Suspense>
  );
}