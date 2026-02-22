"use client";

import { Bar } from "react-chartjs-2";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Group = {
  name: string;
  voted: number;
  total: number;
  color: string;
};

export default function VoterTurnoutBreakdown({ groups }: { groups: Group[] }) {
  const data = {
    labels: groups.map(g => g.name),
    datasets: [
      {
        label: "Voted",
        data: groups.map(g => (g.voted / g.total) * 100),
        backgroundColor: groups.map(g => g.color),
      },
      {
        label: "Not Voted",
        data: groups.map(g => ((g.total - g.voted) / g.total) * 100),
        backgroundColor: "#e5e7eb",
      },
    ],
  };

  const options = {
    indexAxis: "y" as const,
    responsive: true,
    scales: {
      x: { stacked: true, max: 100 },
      y: { stacked: true },
    },
    plugins: { legend: { display: false } },
  };

  return (
      <CardContent className="space-y-4">
        <div className="h-64 flex justify-center">
          <Bar data={data} options={options} />
        </div>

        {groups.map(group => (
          <div
            key={group.name}
            className="flex justify-between items-center border rounded-lg p-3"
          >
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded"
                style={{ backgroundColor: group.color }}
              />
              <span className="font-medium">{group.name}</span>
            </div>
            <span className="text-sm text-muted-foreground">
              {group.voted} / {group.total}
            </span>
          </div>
        ))}
      </CardContent>
  );
}