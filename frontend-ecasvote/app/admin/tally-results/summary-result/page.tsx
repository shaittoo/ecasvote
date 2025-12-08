"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  Menu,
  ChevronDown,
  ChevronRight,
  User,
  LogOut,
  Home,
  BookOpen,
  Vote,
  Users,
  BarChart3,
  FolderOpen,
  Download,
  Printer,
} from "lucide-react";
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
import { fetchElection, fetchResults } from "@/lib/ecasvoteApi";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const ELECTION_ID = 'election-2025';

// Icons
const DashboardIcon = Home;
const BookIcon = BookOpen;
const BallotIcon = Vote;
const ListIcon = Users;
const ChartIcon = BarChart3;
const FolderIcon = FolderOpen;

type SubNavItem = {
  name: string;
  href: string;
  active?: boolean;
};

type NavItem = {
  name: string;
  icon: React.ComponentType<any>;
  href: string;
  active?: boolean;
  subItems?: SubNavItem[];
};

export default function ResultsSummaryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
    election: false,
    voter: false,
    tally: true,
    audit: false,
  });
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

  const toggleMenu = (menu: string) => {
    setExpandedMenus((prev) => ({ ...prev, [menu]: !prev[menu] }));
  };

  const navItems: NavItem[] = [
    { name: "Dashboard", icon: DashboardIcon, href: "/admin" },
    { name: "Help Center", icon: BookIcon, href: "#" },
    { name: "Election Management", icon: BallotIcon, href: "/admin/election-management" },
    {
      name: "Voter Management",
      icon: ListIcon,
      href: "#",
      subItems: [
        { name: "Voter Roster", href: "#" },
        { name: "Token Status", href: "#" },
      ],
    },
    {
      name: "Tally & Results",
      icon: ChartIcon,
      href: "/admin/tally-results",
      active: true,
      subItems: [
        { name: "Voter Turnout", href: "/admin/voter-turnout" },
        { name: "Results Summary", href: "/admin/tally-results/summary-result", active: true },
        { name: "Integrity Check", href: "/admin/tally-results/integrity-check" },
      ],
    },
    {
      name: "Audit & Logs",
      icon: FolderIcon,
      href: "#",
      subItems: [
        { name: "Audit Trail Viewer", href: "#" },
        { name: "System Activity Logs", href: "#" },
      ],
    },
  ];

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
      
      {/* Left Sidebar */}
      <aside
        className={`bg-white border-r border-gray-200 transition-all duration-300 flex flex-col fixed left-0 top-0 h-screen z-10 ${
          sidebarOpen ? "w-64" : "w-20"
        }`}
      >
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          {sidebarOpen ? (
            <div className="flex items-center gap-2">
              <Image
                src="/ecasvotelogo.jpeg"
                alt="eCASVote Logo"
                width={120}
                height={40}
                className="object-contain"
                priority
              />
            </div>
          ) : (
            <div className="w-full flex justify-center">
              <Image
                src="/ecasvotelogo.jpeg"
                alt="eCASVote"
                width={40}
                height={40}
                className="object-contain"
                priority
              />
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        <nav className="p-4 space-y-1 flex-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const hasSubItems = item.subItems && item.subItems.length > 0;
            const menuKey = item.name.toLowerCase().replace(/\s+/g, "");
            const isExpanded = expandedMenus[menuKey] || false;
            const isActive = item.active || ((item.subItems || []).some((s) => s.active) ?? false);

            return (
              <div key={item.name}>
                {!hasSubItems ? (
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? "bg-[#7A0019] text-white"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {sidebarOpen && <span className="font-medium">{item.name}</span>}
                  </Link>
                ) : (
                  <div
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors cursor-pointer ${
                      isActive
                        ? "bg-[#7A0019] text-white"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                    onClick={() => sidebarOpen && toggleMenu(menuKey)}
                  >
                    <Icon className="w-5 h-5" />
                    {sidebarOpen && (
                      <>
                        <span className="font-medium flex-1">{item.name}</span>
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </>
                    )}
                  </div>
                )}

                {sidebarOpen && hasSubItems && isExpanded && (
                  <div className="ml-8 mt-1 space-y-1">
                    {item.subItems?.map((subItem) => (
                      <div
                        key={subItem.name}
                        onClick={() => {
                          if (subItem.href !== "#" && subItem.href !== pathname) {
                            router.push(subItem.href);
                          }
                        }}
                        className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg cursor-pointer ${
                          subItem.active
                            ? "bg-[#7A0019] text-white"
                            : "text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        <span>{subItem.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* User Profile Card */}
        <div className="p-4 border-t border-gray-200 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
              <User className="h-5 w-5 text-muted-foreground" />
            </div>
            {sidebarOpen && (
              <>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">
                    {adminInfo?.fullName || "SEB Admin"}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  title="Logout"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ${
        sidebarOpen ? "ml-64" : "ml-20"
      }`}>
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Results Summary</h1>
            <p className="text-sm text-gray-600 mt-1">Comprehensive election results overview</p>
          </div>
          <div className="flex items-center gap-3 no-print">
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleExport}
              disabled={!results || Object.keys(results).length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handlePrint}
              disabled={!results || Object.keys(results).length === 0}
            >
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 p-6 overflow-y-auto">
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

