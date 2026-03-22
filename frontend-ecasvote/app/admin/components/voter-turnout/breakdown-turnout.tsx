"use client";

import { Bar } from "react-chartjs-2";

type Group = {
  name: string;
  voted: number;
  total: number;
  color: string;
};

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return (part / total) * 100;
}

export default function VoterTurnoutBreakdown({ groups }: { groups: Group[] }) {
  if (groups.length === 0) {
    return null;
  }

  const data = {
    labels: groups.map((g) => g.name),
    datasets: [
      {
        label: "Voted",
        data: groups.map((g) => pct(g.voted, g.total)),
        backgroundColor: groups.map((g) => g.color),
        borderRadius: 4,
      },
      {
        label: "Not voted",
        data: groups.map((g) => pct(g.total - g.voted, g.total)),
        backgroundColor: "#e5e7eb",
        borderRadius: 4,
      },
    ],
  };

  const options = {
    indexAxis: "y" as const,
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        stacked: true,
        max: 100,
        ticks: {
          callback: (value: string | number) => `${value}%`,
        },
        grid: { color: "rgba(0,0,0,0.06)" },
      },
      y: {
        stacked: true,
        grid: { display: false },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: { datasetIndex?: number; dataIndex: number }) => {
            const i = ctx.dataIndex;
            const g = groups[i];
            if (ctx.datasetIndex === 0) {
              return `Voted: ${g.voted} / ${g.total} (${pct(g.voted, g.total).toFixed(0)}%)`;
            }
            return `Not voted: ${g.total - g.voted} / ${g.total}`;
          },
        },
      },
    },
  };

  return (
    <div className="space-y-4">
      <div className="relative h-56 w-full">
        <Bar data={data} options={options} />
      </div>

      <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
        {groups.map((group) => (
          <li
            key={group.name}
            className="flex justify-between items-center gap-3 rounded-lg border border-border/80 bg-card px-3 py-2.5 shadow-sm"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white"
                style={{ backgroundColor: group.color }}
              />
              <span className="font-medium text-sm text-foreground truncate">{group.name}</span>
            </div>
            <span className="text-sm tabular-nums text-muted-foreground shrink-0">
              {group.voted} / {group.total}
              <span className="text-xs ml-1 text-muted-foreground/80">
                ({pct(group.voted, group.total).toFixed(0)}%)
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
