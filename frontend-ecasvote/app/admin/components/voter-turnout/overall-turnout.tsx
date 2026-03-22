"use client";

import { Doughnut } from "react-chartjs-2";

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
  const pct =
    totalVoters > 0 ? ((votedCount / totalVoters) * 100).toFixed(1) : "0";

  const hasData = totalVoters > 0;

  return (
    <div className="flex w-full justify-center py-1">
      <div className="flex flex-col sm:flex-row gap-8 sm:gap-10 items-center justify-center">
      <div className="relative h-52 w-52 shrink-0">
        {hasData ? (
          <>
            <Doughnut
              data={{
                labels: ["Voted", "Not yet voted"],
                datasets: [
                  {
                    data: [votedCount, notVotedCount],
                    backgroundColor: ["#7A0019", "#e5e7eb"],
                    borderWidth: 0,
                    hoverOffset: 4,
                  },
                ],
              }}
              options={{
                cutout: "68%",
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label: (ctx) => {
                        const v = ctx.raw as number;
                        const label = ctx.label ?? "";
                        return `${label}: ${v}`;
                      },
                    },
                  },
                },
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center px-2">
                <div className="text-3xl font-bold tabular-nums text-gray-900">{pct}%</div>
                <div className="text-xs font-medium text-muted-foreground mt-0.5">turnout</div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/25 bg-muted/30">
            <p className="text-center text-sm text-muted-foreground px-4">
              No eligible voters in registry for this pool.
            </p>
          </div>
        )}
      </div>

      <div className="min-w-0 max-w-md space-y-4 text-center">
        <div>
          <p className="text-2xl font-semibold tabular-nums text-gray-900">
            <span className="text-[#7A0019]">{votedCount}</span>
            <span className="text-muted-foreground font-normal"> / </span>
            <span>{totalVoters}</span>
          </p>
          <p className="text-sm text-muted-foreground mt-1">Voted · eligible CAS students</p>
        </div>

        <dl className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
          <div className="rounded-lg border bg-white/80 px-3 py-2 text-center shadow-sm">
            <dt className="text-xs font-medium text-muted-foreground">Voted</dt>
            <dd className="text-lg font-semibold tabular-nums text-gray-900">{votedCount}</dd>
          </div>
          <div className="rounded-lg border bg-white/80 px-3 py-2 text-center shadow-sm">
            <dt className="text-xs font-medium text-muted-foreground">Not yet</dt>
            <dd className="text-lg font-semibold tabular-nums text-gray-700">{notVotedCount}</dd>
          </div>
        </dl>
      </div>
      </div>
    </div>
  );
}
