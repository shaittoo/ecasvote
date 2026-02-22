"use client";

import { Doughnut } from "react-chartjs-2";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  totalVoters: number;
  votedCount: number;
  notVotedCount: number;
};

export default function VoterTurnoutOverall({
  totalVoters,
  votedCount,
  notVotedCount,
}: Props) {
  return (
      <CardContent>
        <div className="flex flex-col md:flex-row gap-6 items-center">
          <div className="relative w-48 h-48">
            <Doughnut
              data={{
                labels: ["Voted", "Not Yet Voted"],
                datasets: [
                  {
                    data: [votedCount, notVotedCount],
                    backgroundColor: ["#0C8C3F", "#e5e7eb"],
                    borderWidth: 0,
                  },
                ],
              }}
              options={{
                cutout: "70%",
                plugins: { legend: { display: false } },
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-3xl font-bold">{votedCount}</div>
                <div className="text-sm text-muted-foreground">Voted</div>
              </div>
            </div>
          </div>

          <div className="flex-1">
            <p className="text-lg font-semibold text-green-600 mb-4">
              {votedCount} out of {totalVoters} voters
            </p>

            <div className="space-y-2 text-sm text-muted-foreground">
              <div>Voted: {votedCount}</div>
              <div>Not Yet Voted: {notVotedCount}</div>
            </div>
          </div>
        </div>
      </CardContent>
  );
}