"use client";

import { useState, useEffect } from "react";
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
import { Download, Printer } from "lucide-react";
import { fetchElection, fetchResults } from "@/lib/ecasvoteApi";
import { AdminSidebar } from "@/components/sidebars/Sidebar";
import AdminHeader from "../../components/header";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const ELECTION_ID = 'election-2025';

export default function ResultsSummaryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [election, setElection] = useState<any>(null);
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adminInfo, setAdminInfo] = useState<any>(null);

  useEffect(() => {
    // Load admin info from localStorage
    if (typeof window !== "undefined") {
      const storedAdmin = localStorage.getItem("admin");
      if (storedAdmin) {
        try {
          setAdminInfo(JSON.parse(storedAdmin));
        } catch (e) {
          console.error("Failed to parse admin info:", e);
        }
      } else {
        setAdminInfo({ fullName: "SEB Admin" });
      }
    }

    async function loadData() {
      try {
        const [electionData, resultsData] = await Promise.all([
          fetchElection(ELECTION_ID),
          fetchResults(ELECTION_ID),
        ]);
        setElection(electionData);
        setResults(resultsData);
      } catch (err: any) {
        setError(err.message || "Failed to load election results");
        console.error("Error loading results:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

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
      const candidateNames = Object.keys(candidates);
      const votes = Object.values(candidates) as number[];

      chartData[positionId] = {
        labels: candidateNames,
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

    // Prepare CSV data
    let csvContent = `"${election.name} - Results Summary"\n`;
    csvContent += `"Generated: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })}\n\n"`;
    csvContent += `"Position","Candidate","Votes","Percentage","Status"\n`;

    // Add results for each position
    Object.keys(results).forEach((positionId) => {
      const positionName = positionId.replace(/-/g, " ");
      const candidates = results[positionId];
      const candidateNames = Object.keys(candidates);
      const votes = Object.values(candidates) as number[];
      const totalVotesForPosition = votes.reduce((a, b) => a + b, 0);
      const maxVotes = Math.max(...votes);

      candidateNames.forEach((candidateName, index) => {
        const voteCount = votes[index];
        const percentage = totalVotesForPosition > 0
          ? ((voteCount / totalVotesForPosition) * 100).toFixed(2)
          : '0.00';
        const isWinner = voteCount === maxVotes && voteCount > 0;
        const status = isWinner ? 'Winner' : '-';

        csvContent += `"${positionName}","${candidateName}","${voteCount}","${percentage}%","${status}"\n`;
      });
      csvContent += '\n'; // Add blank line between positions
    });

    // Create and download CSV file
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

  // Print results
  const handlePrint = () => {
    window.print();
  };

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

      {/* Main Content */}
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
                disabled={!results || Object.keys(results).length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                className="cursor-pointer"
                onClick={handlePrint}
                disabled={!results || Object.keys(results).length === 0}
              >
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
            </div>
          }
        />

        {/* Main Content Area */}
        <main className={`flex-1 p-6 overflow-y-auto transition-all duration-300 ${
          sidebarOpen ? "ml-64" : "ml-20"
        }`}>
          {loading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Loading election results...</p>
            </div>
          ) : error ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-destructive">Error</CardTitle>
                <CardDescription>{error}</CardDescription>
              </CardHeader>
            </Card>
          ) : !results || Object.keys(results).length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No Results Available</CardTitle>
                <CardDescription>
                  Election results will be displayed here once votes have been cast.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="w-full max-w-7xl mx-auto space-y-6">
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
                        variant={election.status === 'CLOSED' ? 'default' : 'secondary'}
                        className="text-lg px-4 py-2"
                      >
                        {election.status}
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
                                legend: {
                                  display: false,
                                },
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
                                  ticks: {
                                    stepSize: 1,
                                  },
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
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

