"use client";

import { Button } from "@/components/ui/button";
import { printBallotPage } from "./PrintableBallotSheet";

/**
 * Toolbar shown only on screen; hidden when printing (see globals.css .print:hidden).
 */
export function PrintBallotActions() {
  return (
    <div className="print-ballot-actions mb-6 flex flex-wrap items-center gap-3 print:hidden">
      <Button type="button" onClick={printBallotPage} className="bg-[#7A0019] text-white hover:bg-[#5c0113]">
        Print ballot
      </Button>
      <p className="text-sm text-gray-600">Uses your browser&apos;s print dialog (save as PDF or send to printer).</p>
    </div>
  );
}
