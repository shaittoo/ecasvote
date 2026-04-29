"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import VoterTurnoutOverall from "./overall-turnout";
import VoterTurnoutBreakdown from "./breakdown-turnout";
import { useState } from "react";

type Props = {
  stats: {
    totalVoters: number;
    votedCount: number;
    notVotedCount: number;
  };
  groups: any[];
};

export default function VoterTurnoutTabs({ stats, groups }: Props) {
  const [activeTab, setActiveTab] = useState<"overall" | "breakdown">("overall");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle>Voter Turnout</CardTitle>

        {/* Custom toggle — much clearer active state than shadcn TabsTrigger defaults */}
        <div className="inline-flex overflow-hidden rounded-lg border border-gray-300 bg-gray-100">
          <button
            type="button"
            onClick={() => setActiveTab("overall")}
            className={
              activeTab === "overall"
                ? "px-4 py-2 text-sm font-bold bg-[#7A0019] text-white shadow-inner transition-colors"
                : "px-4 py-2 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 transition-colors"
            }
          >
            Overall
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("breakdown")}
            className={
              activeTab === "breakdown"
                ? "px-4 py-2 text-sm font-bold bg-[#7A0019] text-white shadow-inner transition-colors"
                : "px-4 py-2 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 transition-colors"
            }
          >
            Breakdown
          </button>
        </div>
      </CardHeader>

      <CardContent>
        {activeTab === "overall" ? (
          <VoterTurnoutOverall {...stats} />
        ) : (
          <VoterTurnoutBreakdown groups={groups} />
        )}
      </CardContent>
    </Card>
  );
}