"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { BallotScanningContent } from "../BallotScanningContent";

function ScanPageInner() {
  const params = useParams();
  const electionId = params.electionId as string;
  return <BallotScanningContent initialElectionId={electionId} />;
}

export default function ScanPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-600">Loading scanner…</div>}>
      <ScanPageInner />
    </Suspense>
  );
}