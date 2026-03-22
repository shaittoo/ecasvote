"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchDashboard,
  fetchElections,
  openElection,
  closeElection,
  type DashboardData,
  type Election,
} from "@/lib/ecasvoteApi";
import { AdminSidebar } from "@/components/Sidebar";
import AdminHeader from "./components/header";
import GreetingCard from "@/components/greeting-card";
import VoterTurnoutTabs from "./components/voter-turnout/tabs-turnout";

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const DEFAULT_ELECTION_ID = "election-2025";

const DEPT_PALETTE = [
  "#ea580c",
  "#dc2626",
  "#9333ea",
  "#16a34a",
  "#2563eb",
  "#ca8a04",
  "#0891b2",
  "#be185d",
  "#4f46e5",
  "#65a30d",
];

function CountdownTimer({ endTime }: { endTime?: string }) {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    if (!endTime) return;

    const tick = () => {
      const now = Date.now();
      const end = new Date(endTime).getTime();
      const difference = end - now;

      if (difference <= 0) {
        setEnded(true);
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }
      setEnded(false);
      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);
      setTimeLeft({ days, hours, minutes, seconds });
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [endTime]);

  if (!endTime) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
        No end time on record. Configure the election in management.
      </div>
    );
  }

  if (ended) {
    return (
      <div className="rounded-lg border bg-muted/30 px-4 py-6 text-center">
        <p className="text-sm font-medium text-foreground">Voting period has ended</p>
        <p className="text-xs text-muted-foreground mt-1">
          Ended {new Date(endTime).toLocaleString()}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/80 bg-card px-3 py-4 sm:px-6 text-center shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">
        Time until election closes
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1 text-lg font-semibold tabular-nums text-foreground sm:text-2xl sm:gap-x-2">
        <span>{String(timeLeft.days).padStart(2, "0")}</span>
        <span className="text-muted-foreground font-normal text-sm sm:text-base">d</span>
        <span className="text-muted-foreground/60">:</span>
        <span>{String(timeLeft.hours).padStart(2, "0")}</span>
        <span className="text-muted-foreground font-normal text-sm sm:text-base">h</span>
        <span className="text-muted-foreground/60">:</span>
        <span>{String(timeLeft.minutes).padStart(2, "0")}</span>
        <span className="text-muted-foreground font-normal text-sm sm:text-base">m</span>
        <span className="text-muted-foreground/60">:</span>
        <span>{String(timeLeft.seconds).padStart(2, "0")}</span>
        <span className="text-muted-foreground font-normal text-sm sm:text-base">s</span>
      </div>
    </div>
  );
}

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

export default function AdminDashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [electionId, setElectionId] = useState(DEFAULT_ELECTION_ID);
  const [elections, setElections] = useState<Election[]>([]);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchElections()
      .then((list) => {
        setElections(list);
        if (list.length > 0 && !list.some((e) => e.id === electionId)) {
          setElectionId(list[0].id);
        }
      })
      .catch(() => setElections([]));
  }, []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDashboard(electionId);
      setDashboardData(data);
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
      setDashboardData(null);
    } finally {
      setLoading(false);
    }
  }, [electionId]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleLogout = () => {
    router.push("/login");
  };

  const stats = useMemo(() => {
    const s = dashboardData?.statistics;
    return {
      totalVoters: s?.totalVoters ?? 0,
      votedCount: s?.votedCount ?? 0,
      notVotedCount: s?.notVotedCount ?? 0,
    };
  }, [dashboardData]);

  const groups = useMemo(() => {
    const rows = dashboardData?.statistics?.byDepartment;
    if (!rows?.length) return [];
    return rows.map((d, i) => ({
      name: d.name,
      voted: d.voted,
      total: d.total,
      color: DEPT_PALETTE[i % DEPT_PALETTE.length],
    }));
  }, [dashboardData]);

  const election = dashboardData?.election;
  const announcements = dashboardData?.announcements ?? [];

  const lastTransaction = announcements.find((a) => a.txId) ?? null;

  const electionFromList = useMemo(
    () => elections.find((e) => e.id === electionId),
    [elections, electionId]
  );

  const displayElectionName = election?.name ?? electionFromList?.name ?? electionId;
  const electionStatus = election?.status ?? electionFromList?.status;
  const endTimeForTimer = election?.endTime ?? electionFromList?.endTime;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AdminSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        active="dashboard"
        userName="John"
        onLogout={handleLogout}
        fixed
        pathname={pathname}
      />

      <div className="flex-1 flex flex-col">
        <AdminHeader
          title="Admin Dashboard"
          subtitle="Overview of election activities and statistics"
          sidebarOpen={sidebarOpen}
        />
        <main
          className={`flex-1 p-2 overflow-y-auto transition-all duration-300 ${
            sidebarOpen ? "ml-64" : "ml-20"
          }`}
        >
          <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="space-y-6">
              <GreetingCard name="John" role="SEB Admin" roleColor="#7A0019" />

              <Card className="border-border/80 shadow-sm overflow-hidden">
                <CardHeader className="space-y-4 border-b bg-muted/30 pb-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-xl font-semibold text-foreground">
                        Election status
                      </CardTitle>
                    </div>
                    {electionStatus ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0 border px-3 py-1 text-xs font-semibold",
                          statusBadgeClass(electionStatus)
                        )}
                      >
                        {electionStatus}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0 text-muted-foreground">
                        Unknown
                      </Badge>
                    )}
                  </div>

                  {/* remove dropdown and refresh button later */}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <label htmlFor="dashboard-election" className="sr-only">
                      Select election
                    </label>
                    <select
                      id="dashboard-election"
                      className="h-10 w-full sm:max-w-md rounded-md border border-input bg-background px-3 text-sm shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={electionId}
                      onChange={(e) => setElectionId(e.target.value)}
                      disabled={loading}
                    >
                      {elections.length === 0 ? (
                        <option value={electionId}>{electionId}</option>
                      ) : (
                        elections.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name || e.id}
                          </option>
                        ))
                      )}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-10 shrink-0 gap-2 sm:w-auto w-full"
                      onClick={() => loadDashboard()}
                      disabled={loading}
                    >
                      <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden />
                      Refresh
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="pt-6 space-y-6">
                  {loading && !dashboardData ? (
                    <p className="text-center text-sm text-muted-foreground py-8">Loading dashboard…</p>
                  ) : (
                    <>
                      <div className="text-center space-y-1">
                        <h2 className="text-2xl font-bold text-foreground tracking-tight">
                          {displayElectionName}
                        </h2>
                        <h3> {election?.description} </h3>
                      </div>

                      <div className="max-w-xl mx-auto">
                        <CountdownTimer endTime={endTimeForTimer} />
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2 pt-1">
                        {electionStatus === "DRAFT" ? (
                          <Button
                            className="flex-1 text-white order-1 sm:order-none"
                            style={{ backgroundColor: "#0C8C3F" }}
                            disabled={loading}
                            onClick={async () => {
                              try {
                                await openElection(electionId);
                                await loadDashboard();
                              } catch (err) {
                                console.error("Failed to open election:", err);
                              }
                            }}
                          >
                            Open election
                          </Button>
                        ) : electionStatus === "OPEN" ? (
                          <Button
                            className="flex-1 text-white order-1 sm:order-none"
                            style={{ backgroundColor: "#dc2626" }}
                            disabled={loading}
                            onClick={async () => {
                              try {
                                await closeElection(electionId);
                                await loadDashboard();
                              } catch (err) {
                                console.error("Failed to close election:", err);
                              }
                            }}
                          >
                            Close election
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          className="flex-1 border-[#7A0019]/30 hover:bg-[#7A0019]/5 cursor-pointer"
                          disabled={loading}
                          onClick={() => router.push("/admin/election-management")}
                        >
                          Manage election
                        </Button>
                      </div>

                      {lastTransaction?.txId ? (
                        <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Last on-chain activity</span>
                          <span className="mx-1.5">·</span>
                          <span className="font-mono">Tx {lastTransaction.txId.slice(0, 10)}…</span>
                          <span className="mx-1.5">·</span>
                          {new Date(lastTransaction.createdAt).toLocaleString()}
                        </div>
                      ) : null}
                    </>
                  )}
                </CardContent>
              </Card>

              <VoterTurnoutTabs stats={stats} groups={groups} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
