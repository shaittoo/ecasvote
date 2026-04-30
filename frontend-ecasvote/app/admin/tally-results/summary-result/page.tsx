"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { CheckCircle2, Download, Lock, Printer } from "lucide-react";
import {
  fetchElection,
  fetchElections,
  fetchPositions,
  fetchResults,
  publishResults,
} from "@/lib/ecasvoteApi";
import type { Election } from "@/lib/ecasvoteApi";
import { AdminSidebar } from "@/components/Sidebar";
import AdminHeader from "../../components/header";
import { notify } from "@/lib/notify";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function ResultsSummaryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [elections, setElections] = useState<Election[]>([]);
  const [electionsLoading, setElectionsLoading] = useState(true);
  const [electionId, setElectionId] = useState("");
  const [election, setElection] = useState<any>(null);
  const [results, setResults] = useState<any>(null);
  const [candidateNameMap, setCandidateNameMap] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);

  // Load elections list
  useEffect(() => {
    setElectionsLoading(true);
    fetchElections()
      .then((list) => {
        setElections(list);
        if (list.length > 0) {
          // Default to first CLOSED election, or first election
          const closed = list.find((e) => e.status === "CLOSED");
          setElectionId(closed?.id ?? list[0].id);
        }
      })
      .catch(() => setElections([]))
      .finally(() => setElectionsLoading(false));
  }, []);

  // Load election data + results when selection changes
  const loadData = useCallback(async () => {
    if (!electionId) {
      setElection(null);
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [electionData, resultsData, positionsData] = await Promise.all([
        fetchElection(electionId),
        fetchResults(electionId),
        fetchPositions(electionId).catch(() => []),
      ]);
      setElection(electionData);
      setResults(resultsData);
      const nextMap: Record<string, Record<string, string>> = {};
      (positionsData || []).forEach((p: any) => {
        const pid = String(p?.id ?? "");
        if (!pid) return;
        nextMap[pid] = {};
        (p?.candidates || []).forEach((c: any) => {
          const cid = String(c?.id ?? "");
          const name = String(c?.name ?? "").trim();
          if (cid && name) nextMap[pid][cid] = name;
        });
      });
      setCandidateNameMap(nextMap);
    } catch (err: any) {
      setError(err.message || "Failed to load election results");
      console.error("Error loading results:", err);
    } finally {
      setLoading(false);
    }
  }, [electionId]);

  useEffect(() => {
    if (!electionsLoading) loadData();
  }, [electionId, electionsLoading, loadData]);

  const handlePublish = async () => {
    if (!electionId) return;
    setShowPublishConfirm(true);
  };

  const confirmPublish = async () => {
    if (!electionId) return;
    setShowPublishConfirm(false);
    setPublishing(true);
    try {
      await publishResults(electionId, true);
      notify.success({ title: "Results published successfully" });
      await loadData();
    } catch (err) {
      notify.error({
        title: "Failed to publish results",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setPublishing(false);
    }
  };

  const handleLogout = () => {
    router.push("/login");
  };

  // Transform results data for charts
  const getChartData = () => {
    if (!results) return null;

    const positions = Object.keys(results);
    const chartData: any = {};

    positions.forEach((positionId) => {
      const candidates = results[positionId];
      const candidateIds = Object.keys(candidates);
      const votes = Object.values(candidates) as number[];
      const candidateNames = candidateIds.map(
        (candidateId) => candidateNameMap[positionId]?.[candidateId] || candidateId
      );

      chartData[positionId] = {
        labels: candidateNames,
        candidateIds,
        datasets: [
          {
            label: "Votes",
            data: votes,
            backgroundColor: [
              "#7A0019",
              "#0C8C3F",
              "#ea580c",
              "#9333ea",
              "#16a34a",
              "#2563eb",
              "#dc2626",
            ],
            borderRadius: 4,
          },
        ],
      };
    });

    return chartData;
  };

  const chartData = getChartData();

  const candidateLabelFor = (positionId: string, candidateId: string): string =>
    candidateNameMap[positionId]?.[candidateId] || candidateId;

  // Calculate total votes across all positions
  const getTotalVotes = () => {
    if (!results) return 0;
    let total = 0;
    Object.values(results).forEach((positionResults: any) => {
      Object.values(positionResults).forEach((voteCount: any) => {
        total += voteCount;
      });
    });
    return total;
  };

  const totalVotes = getTotalVotes();

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Export results to CSV
  const handleExport = () => {
    if (!results || !election) return;

    let csvContent = `"${election.name} - Results Summary"\n`;
    csvContent += `"Generated: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })}\n\n"`;
    csvContent += `"Position","Candidate","Votes","Percentage","Status"\n`;

    Object.keys(results).forEach((positionId) => {
      const positionName = positionId.replace(/-/g, " ");
      const candidates = results[positionId];
      const candidateIds = Object.keys(candidates);
      const votes = Object.values(candidates) as number[];
      const totalVotesForPosition = votes.reduce((a, b) => a + b, 0);
      const maxVotes = Math.max(...votes);

      candidateIds.forEach((candidateId, index) => {
        const voteCount = votes[index];
        const percentage = totalVotesForPosition > 0
          ? ((voteCount / totalVotesForPosition) * 100).toFixed(2)
          : '0.00';
        const isWinner = voteCount === maxVotes && voteCount > 0;
        const status = isWinner ? 'Winner' : '-';

        csvContent += `"${positionName}","${candidateLabelFor(positionId, candidateId)}","${voteCount}","${percentage}%","${status}"\n`;
      });
      csvContent += '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${election.name.replace(/\s+/g, '_')}_Results_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  const electionStatus = election?.status?.toUpperCase() ?? "";
  const isClosed = electionStatus === "CLOSED";
  const isPublished = !!election?.resultsPublished;
  const hasResults = results && Object.keys(results).length > 0;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <style jsx global>{`
        button { cursor: pointer; }
        @media print {
          aside,
          header button,
          .no-print {
            display: none !important;
          }
          main {
            margin-left: 0 !important;
            padding: 1rem !important;
          }
          .print-break {
            page-break-after: always;
          }
          .print-break:last-child {
            page-break-after: auto;
          }
          body {
            background: white !important;
          }
        }
      `}</style>
      <AdminSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        active="tally"
        userName="John"
        onLogout={handleLogout}
        fixed
        pathname={pathname}
      />

      <div className="flex-1 flex flex-col">
        <AdminHeader
          title="Results Summary"
          subtitle="Comprehensive election results overview"
          sidebarOpen={sidebarOpen}
          actions={
            <div className="no-print">
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer mr-2"
                onClick={handleExport}
                disabled={!hasResults}
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer"
                onClick={handlePrint}
                disabled={!hasResults}
              >
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
            </div>
          }
        />

        <main className={`flex-1 p-6 overflow-y-auto transition-all duration-300 ${
          sidebarOpen ? "ml-64" : "ml-20"
        }`}>
          {showPublishConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-lg rounded-lg border border-gray-200 bg-white p-6 shadow-2xl">
                <h3 className="text-lg font-semibold text-gray-900">
                  Publish Results
                </h3>
                <p className="mt-3 text-sm text-gray-700">
                  Publish results for <span className="font-medium text-gray-900">{election?.name || electionId}</span>?
                  This will make results visible to students and validators, and this action cannot be undone.
                </p>
                <div className="mt-6 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowPublishConfirm(false)}
                    disabled={publishing}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className="bg-[#7A0019] hover:bg-[#5a0013] text-white"
                    onClick={confirmPublish}
                    disabled={publishing}
                  >
                    {publishing ? "Publishing..." : "Publish Results"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="w-full max-w-7xl mx-auto space-y-6">
            {/* Election Selector */}
            <div className="flex items-center gap-3 no-print">
              <select
                className="h-10 w-full min-w-0 sm:max-w-md rounded-md border border-input bg-background px-3 text-sm shadow-sm cursor-pointer"
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
              {election && (
                <Badge
                  variant={isClosed ? "default" : "secondary"}
                  className={
                    isPublished
                      ? "bg-green-600 text-white shrink-0"
                      : isClosed
                      ? "shrink-0"
                      : "shrink-0"
                  }
                >
                  {isPublished ? "Results Published" : electionStatus}
                </Badge>
              )}
            </div>

            {/* Content */}
            {electionsLoading || loading ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  {electionsLoading ? "Loading elections..." : "Loading election results..."}
                </p>
              </div>
            ) : error ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-destructive">Error</CardTitle>
                  <CardDescription>{error}</CardDescription>
                </CardHeader>
              </Card>
            ) : !isClosed ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Lock className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">
                    Results are not yet available
                  </h2>
                  <p className="text-gray-500 mb-4">
                    The election must be closed before results can be viewed.
                  </p>
                  <Badge variant="secondary" className="text-sm px-3 py-1">
                    Current status: {electionStatus || "Unknown"}
                  </Badge>
                </CardContent>
              </Card>
            ) : !hasResults ? (
              <Card>
                <CardHeader>
                  <CardTitle>No Results Available</CardTitle>
                  <CardDescription>
                    Election results will be displayed here once votes have been cast.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : (
              <>
                {/* Publish banner (CLOSED but not yet published) */}
                {!isPublished && (
                  <Card className="border-amber-200 bg-amber-50">
                    <CardContent className="py-6">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h3 className="font-semibold text-amber-900">
                            Results are ready
                          </h3>
                          <p className="text-sm text-amber-700 mt-1">
                            Click &quot;Publish Results&quot; to make them visible to students and validators.
                          </p>
                        </div>
                        <Button
                          onClick={handlePublish}
                          disabled={publishing}
                          className="bg-[#7A0019] hover:bg-[#5a0013] text-white shrink-0"
                        >
                          {publishing ? "Publishing..." : "Publish Results"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Published badge */}
                {isPublished && (
                  <Card className="border-green-200 bg-green-50">
                    <CardContent className="py-4">
                      <div className="flex items-center gap-2 text-green-800">
                        <CheckCircle2 className="h-5 w-5" />
                        <span className="font-medium">
                          Results have been published and are visible to students and validators.
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Election Info Summary */}
                {election && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-2xl">{election.name}</CardTitle>
                          <CardDescription className="mt-2">
                            {election.description || "CAS Student Council Elections"}
                          </CardDescription>
                        </div>
                        <Badge
                          variant={isPublished ? "default" : "secondary"}
                          className={`text-lg px-4 py-2 ${isPublished ? "bg-green-600 text-white" : ""}`}
                        >
                          {isPublished ? "Published" : election.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                          <p className="text-sm text-muted-foreground">Start Time</p>
                          <p className="font-semibold mt-1">{formatDate(election.startTime)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">End Time</p>
                          <p className="font-semibold mt-1">{formatDate(election.endTime)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Total Votes Cast</p>
                          <p className="font-semibold mt-1 text-2xl text-[#0C8C3F]">{totalVotes}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Results by Position */}
                {chartData &&
                  Object.keys(chartData).map((positionId) => {
                    const data = chartData[positionId];
                    const totalVotesForPosition = data.datasets[0].data.reduce(
                      (a: number, b: number) => a + b,
                      0
                    );
                    const winner = data.labels[
                      data.datasets[0].data.indexOf(Math.max(...data.datasets[0].data))
                    ];
                    const winnerVotes = Math.max(...data.datasets[0].data);

                    return (
                      <Card key={positionId} className="print-break">
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <div>
                              <CardTitle className="text-xl capitalize">
                                {positionId.replace(/-/g, " ")}
                              </CardTitle>
                              <CardDescription className="mt-1">
                                Total votes: {totalVotesForPosition}
                              </CardDescription>
                            </div>
                            {winner && (
                              <Badge variant="outline" className="text-sm px-3 py-1">
                                Winner: {winner} ({winnerVotes} votes)
                              </Badge>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="mb-6">
                            <Bar
                              data={data}
                              options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {
                                  legend: { display: false },
                                  tooltip: {
                                    callbacks: {
                                      label: function (context: any) {
                                        const votes = context.parsed.y;
                                        const percentage =
                                          totalVotesForPosition > 0
                                            ? ((votes / totalVotesForPosition) * 100).toFixed(1)
                                            : 0;
                                        return `${votes} votes (${percentage}%)`;
                                      },
                                    },
                                  },
                                },
                                scales: {
                                  y: {
                                    beginAtZero: true,
                                    ticks: { stepSize: 1 },
                                  },
                                },
                              }}
                              height={300}
                            />
                          </div>

                          {/* Results Table */}
                          <div className="border rounded-lg overflow-hidden">
                            <table className="w-full">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                                    Candidate
                                  </th>
                                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                                    Votes
                                  </th>
                                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                                    Percentage
                                  </th>
                                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900">
                                    Status
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {data.labels.map((candidate: string, index: number) => {
                                  const votes = data.datasets[0].data[index] as number;
                                  const percentage =
                                    totalVotesForPosition > 0
                                      ? ((votes / totalVotesForPosition) * 100).toFixed(1)
                                      : 0;
                                  const isWinner = votes === winnerVotes && votes > 0;

                                  return (
                                    <tr
                                      key={candidate}
                                      className={isWinner ? "bg-green-50" : ""}
                                    >
                                      <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium">{candidate}</span>
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 text-right font-semibold">
                                        {votes}
                                      </td>
                                      <td className="px-4 py-3 text-right text-muted-foreground">
                                        {percentage}%
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        {isWinner ? (
                                          <Badge className="bg-green-600 text-white">
                                            Winner
                                          </Badge>
                                        ) : (
                                          <span className="text-sm text-gray-500">-</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
