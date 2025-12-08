"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Bell, Settings, HelpCircle, Menu, LogOut, User, Home, BookOpen, CheckSquare, Shield, BarChart3 } from "lucide-react";
import { fetchElection, fetchResults } from "@/lib/ecasvoteApi";

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const ELECTION_ID = "election-2025";

// Icons
const DashboardIcon = Home;
const BookIcon = BookOpen;
const CheckboxIcon = CheckSquare;
const ShieldIcon = Shield;
const ChartIcon = BarChart3;

// Countdown Timer Component
function CountdownTimer({ endTime }: { endTime?: string }) {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    if (!endTime) return;

    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const end = new Date(endTime).getTime();
      const difference = end - now;

      if (difference <= 0) {
        return { days: 0, hours: 0, minutes: 0, seconds: 0 };
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      return { days, hours, minutes, seconds };
    };

    // Calculate immediately
    setTimeLeft(calculateTimeLeft());

    // Update every second
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [endTime]);

  return (
    <div className="flex items-center gap-2">
      <div className="text-center">
        <div className="text-2xl font-bold text-[#0C8C3F]">
          {String(timeLeft.days).padStart(2, "0")}
        </div>
        <div className="text-xs text-gray-500">days</div>
      </div>
      <span className="text-2xl font-bold text-[#0C8C3F]">:</span>
      <div className="text-center">
        <div className="text-2xl font-bold text-[#0C8C3F]">
          {String(timeLeft.hours).padStart(2, "0")}
        </div>
        <div className="text-xs text-gray-500">hours</div>
      </div>
      <span className="text-2xl font-bold text-[#0C8C3F]">:</span>
      <div className="text-center">
        <div className="text-2xl font-bold text-[#0C8C3F]">
          {String(timeLeft.minutes).padStart(2, "0")}
        </div>
        <div className="text-xs text-gray-500">minutes</div>
      </div>
      <span className="text-2xl font-bold text-[#0C8C3F]">:</span>
      <div className="text-center">
        <div className="text-2xl font-bold text-[#0C8C3F]">
          {String(timeLeft.seconds).padStart(2, "0")}
        </div>
        <div className="text-xs text-gray-500">seconds</div>
      </div>
    </div>
  );
}

export default function ResultsPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [election, setElection] = useState<any>(null);
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voterInfo, setVoterInfo] = useState<any>(null);

  useEffect(() => {
    // Load voter info from localStorage
    if (typeof window !== "undefined") {
      const storedVoter = localStorage.getItem("voter");
      if (storedVoter) {
        try {
          setVoterInfo(JSON.parse(storedVoter));
        } catch (e) {
          console.error("Failed to parse voter info:", e);
        }
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

  const navItems = [
    { name: "Dashboard", icon: DashboardIcon, href: "/home", active: false },
    { name: "Onboarding", icon: BookIcon, href: "#", active: false },
    { name: "Cast Vote", icon: CheckboxIcon, href: "/vote", active: false },
    { name: "Privacy Statement", icon: ShieldIcon, href: "#", active: false },
    { name: "Election Results", icon: ChartIcon, href: "/results", active: true },
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
            ],
            borderRadius: 4,
          },
        ],
      };
    });

    return chartData;
  };

  const chartData = getChartData();

  return (
    <div className="min-h-screen bg-gray-50 flex">
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
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  item.active
                    ? "bg-[#7A0019] text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <Icon className="w-5 h-5" />
                {sidebarOpen && <span className="font-medium">{item.name}</span>}
              </Link>
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
                    {voterInfo?.fullName || "User"}
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
        {/* Top Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 max-w-2xl">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search keyword or actions..."
                  className="w-full pl-10 pr-20"
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-muted-foreground">
                  12 results
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 ml-6">
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full"></span>
              </Button>
              <Button variant="ghost" size="icon">
                <Settings className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon">
                <HelpCircle className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 p-2 overflow-y-auto">
          <div className="w-full max-w-8xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading results...</p>
          </div>
        ) : error ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-destructive">Error</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </Card>
        ) : election && election.status !== 'CLOSED' ? (
          // Show "Results Not Available Yet" when election is not closed
          <div className="space-y-6">
            {/* Election Status Card */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="bg-[#0C8C3F] text-white px-3 py-1 rounded-full text-sm font-medium">
                        Ongoing Elections
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold mb-4">
                      {election?.name || "CAS Student Council Elections 2026"}
                    </h3>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-[#7A0019] mb-2">Election Countdown</p>
                    <CountdownTimer endTime={election?.endTime} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Results Not Available Message */}
            <div className="text-center py-16">
              <h2 className="text-3xl font-bold text-[#7A0019] mb-4">
                Results Not Available Yet!
              </h2>
              <p className="text-gray-600 text-lg">
                The {election?.name || "CAS SC Elections 2026"} is still ongoing. Final tallies will be available after the election period.
              </p>
            </div>
          </div>
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
          <div className="space-y-6">
            {/* Election Info */}
            {election && (
              <Card>
                <CardHeader>
                  <CardTitle>Election Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <p className="font-semibold">{election.status}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Start Time</p>
                      <p className="font-semibold">
                        {new Date(election.startTime).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">End Time</p>
                      <p className="font-semibold">
                        {new Date(election.endTime).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Results by Position */}
            {chartData &&
              Object.keys(chartData).map((positionId) => {
                const data = chartData[positionId];
                const totalVotes = data.datasets[0].data.reduce(
                  (a: number, b: number) => a + b,
                  0
                );

                return (
                  <Card key={positionId}>
                    <CardHeader>
                      <CardTitle className="capitalize">
                        {positionId.replace(/-/g, " ")}
                      </CardTitle>
                      <CardDescription>
                        Total votes: {totalVotes}
                      </CardDescription>
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
                                      totalVotes > 0
                                        ? ((votes / totalVotes) * 100).toFixed(1)
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
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {data.labels.map((candidate: string, index: number) => {
                              const votes = data.datasets[0].data[index] as number;
                              const percentage =
                                totalVotes > 0
                                  ? ((votes / totalVotes) * 100).toFixed(1)
                                  : 0;
                              const isWinner =
                                votes === Math.max(...(data.datasets[0].data as number[]));

                              return (
                                <tr
                                  key={candidate}
                                  className={isWinner ? "bg-green-50" : ""}
                                >
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">{candidate}</span>
                                      {isWinner && (
                                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                                          Winner
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-right font-semibold">
                                    {votes}
                                  </td>
                                  <td className="px-4 py-3 text-right text-muted-foreground">
                                    {percentage}%
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
          </div>
        </main>
      </div>
    </div>
  );
}

