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
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No eligible voter rows or no academic organizations in the registry.
      </p>
    );
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

  // Build "x out of y" labels shown to the right of each bar
  const barLabels = groups.map((g) => `${g.voted} out of ${g.total}`);

  const options = {
    indexAxis: "y" as const,
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: { right: 100 },
    },
    scales: {
      x: {
        stacked: true,
        max: 100,
        ticks: {
          stepSize: 10,
          callback: (value: string | number) => `${value}`,
        },
        title: {
          display: true,
          text: "%",
          font: { size: 12 },
          color: "#6b7280",
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

  // Chart.js plugin to draw "x out of y" labels to the right of each bar
  const barLabelPlugin = {
    id: "barLabels",
    afterDraw(chart: any) {
      const { ctx, scales } = chart;
      const yScale = scales.y;
      const xScale = scales.x;
      ctx.save();
      ctx.font = "12px sans-serif";
      ctx.fillStyle = "#6b7280";
      ctx.textAlign = "left" as const;
      ctx.textBaseline = "middle" as const;
      barLabels.forEach((label: string, i: number) => {
        const y = yScale.getPixelForValue(i);
        const x = xScale.getPixelForValue(100);
        ctx.fillText(label, x + 8, y);
      });
      ctx.restore();
    },
  };

  return (
    <div>
      <div className="relative h-56 w-full">
        <Bar data={data} options={options} plugins={[barLabelPlugin]} />
      </div>
    </div>
  );
}