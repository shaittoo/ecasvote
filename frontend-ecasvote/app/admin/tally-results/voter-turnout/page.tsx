"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileDown, RefreshCw } from "lucide-react";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
} from "chart.js";
import { Line } from "react-chartjs-2";
import {
  fetchElections,
  fetchElectionTurnout,
  fetchHourlyParticipation,
  type ElectionTurnoutStats,
  type HourlyParticipationResponse,
} from "@/lib/ecasvoteApi";
import { AdminSidebar } from "@/components/Sidebar";
import AdminHeader from "../../components/header";
import VoterTurnoutOverall from "../../components/voter-turnout/overall-turnout";
import VoterTurnoutBreakdown from "../../components/voter-turnout/breakdown-turnout";

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement
);

const DEFAULT_ELECTION_ID = "election-2025";

/** Distinct colors for department bars (cycles if many departments) */
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

function departmentColor(name: string, index: number): string {
  return DEPT_PALETTE[index % DEPT_PALETTE.length];
}

export default function VoterTurnoutPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [elections, setElections] = useState<{ id: string; name: string }[]>([]);
  const [electionId, setElectionId] = useState(DEFAULT_ELECTION_ID);
  const [electionName, setElectionName] = useState("");
  const [selectedDate, setSelectedDate] = useState(
    () => new Date().toISOString().split("T")[0]
  );
  const [turnoutStats, setTurnoutStats] = useState<ElectionTurnoutStats | null>(null);
  const [hourlyData, setHourlyData] = useState<HourlyParticipationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adminInfo, setAdminInfo] = useState<{ fullName?: string } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("admin");
    if (stored) {
      try {
        setAdminInfo(JSON.parse(stored));
      } catch {
        setAdminInfo({ fullName: "SEB Admin" });
      }
    } else {
      setAdminInfo({ fullName: "SEB Admin" });
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchElections();
      setElections(list.map((e) => ({ id: e.id, name: e.name })));

      let eid = electionId;
      if (list.length > 0 && !list.some((e) => e.id === eid)) {
        eid = list[0].id;
        setElectionId(eid);
      }
      const current = list.find((e) => e.id === eid);
      setElectionName(current?.name ?? eid);

      const stats = await fetchElectionTurnout(eid);
      setTurnoutStats(stats);

      try {
        const hourly = await fetchHourlyParticipation(eid, selectedDate);
        setHourlyData(hourly);
      } catch (he) {
        console.warn(he);
        setHourlyData({
          hourlyData: [],
          peakHour: { time: "00:00", count: 0 },
          slowestHour: { time: "00:00", count: 0 },
          totalVotes: 0,
        });
      }
    } catch (err: unknown) {
      console.error("Failed to load voter turnout data:", err);
      setError(err instanceof Error ? err.message : "Failed to load turnout");
      setTurnoutStats({
        electionId: electionId,
        totalVoters: 0,
        votedCount: 0,
        notVotedCount: 0,
        byDepartment: [],
        byYearLevel: [],
        byProgram: [],
      });
      setHourlyData({
        hourlyData: [],
        peakHour: { time: "00:00", count: 0 },
        slowestHour: { time: "00:00", count: 0 },
        totalVotes: 0,
      });
    } finally {
      setLoading(false);
    }
  }, [electionId, selectedDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleLogout = () => {
    router.push("/login");
  };

  const totalVoters = turnoutStats?.totalVoters ?? 0;
  const votedCount = turnoutStats?.votedCount ?? 0;
  const notVotedCount = turnoutStats?.notVotedCount ?? 0;

  const groupsData = (turnoutStats?.byDepartment ?? []).map((dept, i) => ({
    name: dept.name,
    voted: dept.voted,
    total: dept.total,
    color: departmentColor(dept.name, i),
  }));

  const hourlyChartData = hourlyData
    ? {
        labels: hourlyData.hourlyData.map((d) => {
          const hour = parseInt(d.hour.split(":")[0], 10);
          return `${hour.toString().padStart(2, "0")}:00`;
        }),
        datasets: [
          {
            label: "Votes",
            data: hourlyData.hourlyData.map((d) => d.count),
            borderColor: "#2563eb",
            backgroundColor: "rgba(37, 99, 235, 0.1)",
            tension: 0.4,
            fill: true,
            pointRadius: 5,
            pointBackgroundColor: "#2563eb",
          },
        ],
      }
    : {
        labels: [] as string[],
        datasets: [
          {
            label: "Votes",
            data: [] as number[],
            borderColor: "#2563eb",
            backgroundColor: "rgba(37, 99, 235, 0.1)",
            tension: 0.4,
            fill: true,
            pointRadius: 5,
            pointBackgroundColor: "#2563eb",
          },
        ],
      };

  const formatDateForDisplay = (dateString: string) => {
    const date = new Date(dateString + "T12:00:00");
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const getAvailableDates = () => {
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      dates.push(date.toISOString().split("T")[0]);
    }
    return dates.reverse();
  };

  const peakTicks =
    hourlyData && hourlyData.peakHour.count > 10 ? 5 : 1;

  const exportPdf = () => {
    if (typeof window === "undefined") return;
    window.print();
  };

  return (
    <div className="voter-turnout-print-root min-h-screen bg-muted/40 flex">
      <AdminSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        active="tally"
        userName={adminInfo?.fullName ?? "Admin"}
        onLogout={handleLogout}
        fixed
        pathname={pathname}
      />

      <div className="flex-1 flex flex-col">
        <AdminHeader
          title="Voter Turnout"
          subtitle="Eligible CAS pool vs. votes recorded for the selected election"
          sidebarOpen={sidebarOpen}
        />

        <main
          className={`flex-1 p-6 overflow-y-auto transition-all duration-300 print:p-4 print:overflow-visible ${
            sidebarOpen ? "ml-64" : "ml-20"
          } print:!ml-0`}
        >
          {loading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Loading voter turnout data...</p>
            </div>
          ) : (
            <div
              id="voter-turnout-report"
              className="w-full max-w-7xl mx-auto space-y-6 print:max-w-none"
            >
              {/* Visible in PDF only */}
              <div className="hidden print:block border-b border-border pb-4 mb-2">
                <h2 className="text-xl font-semibold text-foreground">Voter turnout report</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  <span className="font-medium text-foreground">{electionName || electionId}</span>
                  {" · "}
                  Hourly date: {formatDateForDisplay(selectedDate)}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Generated {new Date().toLocaleString()}
                  {adminInfo?.fullName ? ` · ${adminInfo.fullName}` : ""}
                </p>
              </div>

              <Card className="border-border/80 shadow-sm print:hidden">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-semibold tracking-tight">
                    Election &amp; export
                  </CardTitle>
                  <CardDescription>
                    Choose an election, reload turnout, or save a PDF of this page.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
                    <div className="min-w-0 flex-1 space-y-1.5 sm:max-w-md lg:max-w-lg">
                      <select
                        id="turnout-election"
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={electionId}
                        onChange={(e) => setElectionId(e.target.value)}
                      >
                        {elections.length === 0 ? (
                          <option value={electionId}>{electionName || electionId}</option>
                        ) : (
                          elections.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.name}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 gap-2"
                        onClick={() => loadData()}
                      >
                        <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
                        Refresh
                      </Button>
                      <Button
                        type="button"
                        className="h-10 gap-2 bg-[#7A0019] hover:bg-[#5c0013] text-white"
                        onClick={exportPdf}
                        title="Opens the print dialog — choose Save as PDF or Microsoft Print to PDF."
                      >
                        <FileDown className="h-4 w-4 shrink-0" aria-hidden />
                        Export PDF
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {error ? (
                <div
                  className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                  role="alert"
                >
                  {error}
                </div>
              ) : null}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:gap-4">
                <Card className="border-border/80 shadow-sm print:break-inside-avoid print:shadow-none">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-semibold">Overall</CardTitle>
                    <p className="text-sm text-muted-foreground font-normal leading-relaxed">
                      {electionName || electionId}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <VoterTurnoutOverall
                      totalVoters={totalVoters}
                      votedCount={votedCount}
                      notVotedCount={notVotedCount}
                    />
                  </CardContent>
                </Card>

                <Card className="border-border/80 shadow-sm print:break-inside-avoid print:shadow-none">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-semibold">By department</CardTitle>
                    <p className="text-sm text-muted-foreground font-normal">
                      Share of turnout within each department
                    </p>
                  </CardHeader>
                  <CardContent>
                    {groupsData.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">
                        No eligible voter rows or no departments in the registry.
                      </p>
                    ) : (
                      <>
                        <VoterTurnoutBreakdown groups={groupsData} />
                        <p className="mt-4 text-center text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">{votedCount}</span> of{" "}
                          <span className="font-medium text-foreground">{totalVoters}</span>{" "}
                          eligible students voted
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card className="border-border/80 shadow-sm print:break-inside-avoid print:shadow-none">
                <CardHeader className="flex flex-col gap-4 space-y-0 pb-2 sm:flex-row sm:items-end sm:justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg font-semibold">Hourly participation</CardTitle>
                    <p className="text-sm text-muted-foreground font-normal">
                      Digital + paper votes by hour (local time)
                    </p>
                    <p className="hidden print:block text-sm font-medium text-foreground pt-1">
                      Date: {formatDateForDisplay(selectedDate)}
                    </p>
                  </div>
                  <div className="w-full shrink-0 space-y-1.5 sm:w-auto sm:min-w-[12rem] print:hidden">
                    <label
                      htmlFor="turnout-date"
                      className="text-sm font-medium leading-none text-foreground"
                    >
                      Date
                    </label>
                    <select
                      id="turnout-date"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                    >
                      {getAvailableDates().map((date) => (
                        <option key={date} value={date}>
                          {formatDateForDisplay(date)}
                        </option>
                      ))}
                    </select>
                  </div>
                </CardHeader>
                <CardContent>
                  {hourlyData ? (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <div className="lg:col-span-2">
                        <div className="w-full h-64">
                          <Line
                            data={hourlyChartData}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              plugins: {
                                legend: {
                                  display: false,
                                },
                              },
                              scales: {
                                x: {
                                  grid: { color: "rgba(0,0,0,0.06)" },
                                },
                                y: {
                                  beginAtZero: true,
                                  ticks: {
                                    stepSize: peakTicks,
                                    precision: 0,
                                  },
                                  grid: { color: "rgba(0,0,0,0.06)" },
                                },
                              },
                            }}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col justify-center rounded-lg border bg-muted/30 p-4">
                        <h4 className="font-semibold text-foreground mb-3 text-sm uppercase tracking-wide">
                          Summary
                        </h4>
                        <dl className="space-y-3 text-sm">
                          <div>
                            <dt className="text-muted-foreground">Peak hour</dt>
                            <dd className="font-medium text-foreground mt-0.5">
                              {hourlyData.peakHour.time}{" "}
                              <span className="text-muted-foreground font-normal">
                                ({hourlyData.peakHour.count}{" "}
                                {hourlyData.peakHour.count === 1 ? "vote" : "votes"})
                              </span>
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Slowest hour</dt>
                            <dd className="font-medium text-foreground mt-0.5">
                              {hourlyData.slowestHour.time}{" "}
                              <span className="text-muted-foreground font-normal">
                                ({hourlyData.slowestHour.count}{" "}
                                {hourlyData.slowestHour.count === 1 ? "vote" : "votes"})
                              </span>
                            </dd>
                          </div>
                          <div className="pt-2 border-t border-border/80">
                            <dt className="text-muted-foreground">Total this date</dt>
                            <dd className="text-lg font-semibold tabular-nums text-[#7A0019] mt-0.5">
                              {hourlyData.totalVotes}
                            </dd>
                            <p className="text-xs text-muted-foreground mt-1">Digital + paper</p>
                          </div>
                        </dl>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      No hourly participation data for this date.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
