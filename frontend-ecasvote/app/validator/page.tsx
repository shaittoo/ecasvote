"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
} from "chart.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  fetchDashboard,
  fetchElection,
  fetchElections,
  fetchPositions,
  fetchResults,
  fetchAuditLogs,
  fetchIntegrityCheck,
} from "@/lib/ecasvoteApi";
import type {
  Election,
  Position,
  AuditLog,
  IntegrityCheckData,
} from "@/lib/ecasvoteApi";
import { ValidatorSidebar } from "@/components/Sidebar";
import ValidatorHeader from "./components/header";
import GreetingCard from "@/components/greeting-card";

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

function statusBadgeClass(status: string | undefined) {
  switch (status) {
    case "OPEN":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "DRAFT":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "CLOSED":
      return "border-slate-200 bg-slate-100 text-slate-800";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function statusLabel(status: string | undefined) {
  switch (status) {
    case "OPEN":
      return "Voting in progress";
    case "DRAFT":
      return "Draft";
    case "CLOSED":
      return "Closed";
    default:
      return "Unknown";
  }
}

export default function ValidatorDashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [elections, setElections] = useState<Election[]>([]);
  const [electionId, setElectionId] = useState("");
  const [electionsLoading, setElectionsLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [results, setResults] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [integrityData, setIntegrityData] = useState<IntegrityCheckData | null>(null);
  const [integrityLoading, setIntegrityLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setElectionsLoading(true);
    fetchElections()
      .then((list) => {
        setElections(list);
        const open = list.find((e) => e.status === "OPEN");
        const closed = list.find((e) => e.status === "CLOSED");
        setElectionId(open?.id ?? closed?.id ?? list[0]?.id ?? "");
      })
      .catch(() => setElections([]))
      .finally(() => setElectionsLoading(false));
  }, []);

  useEffect(() => {
    if (!electionId || electionsLoading) return;
    setLoading(true);
    async function loadData() {
      try {
        const [dashboard, positionsData, resultsData, auditData] = await Promise.all([
          fetchDashboard(electionId).catch(() => null),
          fetchPositions(electionId).catch(() => []),
          fetchResults(electionId).catch(() => null),
          fetchAuditLogs(electionId).catch(() => ({ logs: [], count: 0 })),
        ]);

        setDashboardData(dashboard);
        setPositions(positionsData || []);
        setResults(resultsData);
        setAuditLogs(auditData?.logs || []);
      } catch (err) {
        console.error("Failed to load validator data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [electionId, electionsLoading]);

  const loadIntegrityData = async () => {
    if (!electionId) return;
    setIntegrityLoading(true);
    try {
      const integrityCheckData = await fetchIntegrityCheck(electionId);
      setIntegrityData(integrityCheckData);
    } catch (err) {
      console.error("Failed to load integrity check data:", err);
      setIntegrityData(null);
    } finally {
      setIntegrityLoading(false);
    }
  };

  const handleLogout = () => {
    router.push("/login");
  };

  const sidebarUserName = "Validator";
  const stats = dashboardData?.statistics || { totalVoters: 0, votedCount: 0, notVotedCount: 0 };
  const election = dashboardData?.election;

  // (kept for when the page is wired up later — not rendered now)
  const voterTurnoutData = {
    labels: ["Voted", "Not Yet Voted"],
    datasets: [
      {
        data: [stats.votedCount, stats.notVotedCount],
        backgroundColor: ["#0C8C3F", "#e5e7eb"],
        borderWidth: 0,
      },
    ],
  };

  const resultsCharts = positions.map((position) => {
    const positionResults = results?.[position.id] || {};
    const candidates = Object.keys(positionResults);
    const votes = Object.values(positionResults) as number[];

    return {
      position: position.name,
      data: {
        labels: candidates.map((candId) => {
          const candidate = position.candidates?.find((c) => c.id === candId);
          return candidate?.name || candId;
        }),
        datasets: [
          {
            label: "Votes",
            data: votes,
            backgroundColor: "#7A0019",
            borderRadius: 4,
          },
        ],
      },
    };
  });

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <ValidatorSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        active="overview"
        userName={sidebarUserName}
        onLogout={handleLogout}
        fixed
        pathname={pathname}
      />

      <div className="flex-1 flex flex-col">
        <ValidatorHeader
          title="Validator Dashboard"
          subtitle="Monitor and verify election integrity"
          sidebarOpen={sidebarOpen}
        />
        <main
          className={`flex-1 p-2 overflow-y-auto transition-all duration-300 ${
            sidebarOpen ? "ml-64" : "ml-20"
          }`}
        >
          <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="space-y-6">
              <GreetingCard name="Validator" role="Validator" roleColor="#3B82F6" />

              <Card className="border-border/80 shadow-sm overflow-hidden">
                {/* Toolbar: dropdown only, matches admin dashboard pattern */}
                <CardHeader className="pb-4 border-b bg-muted/30">
                  <label htmlFor="validator-election" className="sr-only">
                    Select election
                  </label>
                  <select
                    id="validator-election"
                    className="h-10 w-full sm:max-w-md rounded-md border border-input bg-background px-3 text-sm shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={electionId}
                    disabled={electionsLoading || elections.length === 0}
                    onChange={(e) => setElectionId(e.target.value)}
                  >
                    {electionsLoading ? (
                      <option value="">Loading elections...</option>
                    ) : elections.length === 0 ? (
                      <option value="">No elections found</option>
                    ) : (
                      elections.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name || e.id}
                        </option>
                      ))
                    )}
                  </select>
                </CardHeader>

                <CardContent className="pt-6 space-y-6">
                  {loading && !dashboardData ? (
                    <p className="text-center text-sm text-muted-foreground py-8">
                      Loading election information…
                    </p>
                  ) : election ? (
                    <>
                      {/* Election name + status, grouped together (matches admin dashboard) */}
                      <div className="text-center space-y-3">
                        <div className="flex flex-wrap items-center justify-center gap-3">
                          <h2 className="text-2xl font-bold text-foreground tracking-tight">
                            {election.name}
                          </h2>
                          <Badge
                            variant="outline"
                            className={cn(
                              "border px-3 py-1 text-xs font-semibold",
                              statusBadgeClass(election.status)
                            )}
                          >
                            {statusLabel(election.status)}
                          </Badge>
                        </div>
                        {election.description && (
                          <p className="text-sm text-muted-foreground">
                            {election.description}
                          </p>
                        )}
                      </div>

                      {/* Start / End times */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl mx-auto">
                        <div className="rounded-lg border border-border/80 bg-card p-4">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                            Start Time
                          </p>
                          <p className="font-medium text-sm">
                            {new Date(election.startTime).toLocaleString("en-US", {
                              timeZone: "Asia/Manila",
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <div className="rounded-lg border border-border/80 bg-card p-4">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                            End Time
                          </p>
                          <p className="font-medium text-sm">
                            {new Date(election.endTime).toLocaleString("en-US", {
                              timeZone: "Asia/Manila",
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-center py-8 text-sm text-muted-foreground">
                      No active elections at this time.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}