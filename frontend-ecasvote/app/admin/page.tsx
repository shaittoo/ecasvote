"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
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
import { Doughnut, Bar } from "react-chartjs-2";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, Bell, Settings, HelpCircle, Menu, LogOut, User, ChevronDown, ChevronRight, Home, BookOpen, Vote, Users, BarChart3, FolderOpen, FileText, Grid } from "lucide-react";
import { fetchDashboard, fetchElection, openElection } from "@/lib/ecasvoteApi";
import Sidebar from "./components/sidebar";

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const ELECTION_ID = 'election-2025';

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
    <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
      <div className="text-2xl font-semibold text-gray-900">
        {String(timeLeft.days).padStart(2, "0")} days : {String(timeLeft.hours).padStart(2, "0")} hours : {String(timeLeft.minutes).padStart(2, "0")} minutes : {String(timeLeft.seconds).padStart(2, "0")} seconds
      </div>
    </div>
  );
}

// Horizontal Bar Chart Component for Group Breakdown
function GroupBreakdownChart({ groups }: { groups: Array<{ name: string; voted: number; total: number; color: string }> }) {
  const data = {
    labels: groups.map(g => g.name),
    datasets: [
      {
        label: 'Voted',
        data: groups.map(g => (g.voted / g.total) * 100),
        backgroundColor: groups.map(g => g.color),
        borderRadius: 4,
      },
      {
        label: 'Not Voted',
        data: groups.map(g => ((g.total - g.voted) / g.total) * 100),
        backgroundColor: '#e5e7eb',
        borderRadius: 4,
      },
    ],
  };

  const options = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            const groupIndex = context.dataIndex;
            const group = groups[groupIndex];
            if (context.datasetIndex === 0) {
              return `${group.voted} out of ${group.total} (${Math.round((group.voted / group.total) * 100)}%)`;
            } else {
              return `${group.total - group.voted} out of ${group.total} (${Math.round(((group.total - group.voted) / group.total) * 100)}%)`;
            }
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        max: 100,
        ticks: {
          callback: function(value: any) {
            return value + '%';
          },
        },
      },
      y: {
        stacked: true,
      },
    },
  };

  return (
    <div className="w-full h-64">
      <Bar data={data} options={options} />
    </div>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const pathname = usePathname();
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overall" | "breakdown">("overall");
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
    election: false,
    voter: false,
    tally: false,
    audit: false,
  });

  useEffect(() => {
    async function loadDashboard() {
      try {
        const data = await fetchDashboard(ELECTION_ID);
        setDashboardData(data);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  const handleLogout = () => {
    router.push("/login");
  };

  const toggleMenu = (menu: string) => {
    setExpandedMenus(prev => ({ ...prev, [menu]: !prev[menu] }));
  };

  const stats = dashboardData?.statistics || { totalVoters: 1200, votedCount: 890, notVotedCount: 310 };
  const election = dashboardData?.election;
  const announcements = dashboardData?.announcements || [];
  
  // Get the most recent transaction from audit logs
  const lastTransaction = announcements.find((a: any) => a.txId) || null;

  // Mock group data - in real app, this would come from the database
  const groups = [
    { name: "Red Bolts", voted: 184, total: 200, color: "#dc2626" },
    { name: "Skimmers", voted: 252, total: 300, color: "#9333ea" },
    { name: "Elektrons", voted: 380, total: 500, color: "#ea580c" },
    { name: "Clovers", voted: 74, total: 200, color: "#16a34a" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
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
          <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle>Hello, John!</CardTitle>
                    <Badge variant="secondary" className="bg-[#7A0019] text-white">
                      SEB Admin
                    </Badge>
                  </div>
                  <CardDescription>
                    Welcome to UPV CAS Student Council's Online Voting System
                  </CardDescription>
                </CardHeader>
              </Card>

              {/* Ongoing Elections Card */}
              <Card>
                <CardHeader>
                  <div className="flex items-center text-center gap-2 mb-2">
                    <span className="text-xs font-medium text-muted-foreground">Admin Control Panel</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <CardTitle className="text-green-600">Ongoing Elections</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <h3 className="text-2xl text-center font-bold mb-4">
                      {election?.name || "CAS Student Council Elections 2026"}
                    </h3>
                    <div className="flex items-center justify-center gap-4">
                      <CountdownTimer endTime={election?.endTime} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {election?.status === 'DRAFT' ? (
                      <Button
                        className="flex-1 text-white"
                        style={{ backgroundColor: "#0C8C3F" }}
                        onClick={async () => {
                          try {
                            await openElection(ELECTION_ID);
                            // Reload dashboard data
                            const data = await fetchDashboard(ELECTION_ID);
                            setDashboardData(data);
                          } catch (err) {
                            console.error('Failed to open election:', err);
                          }
                        }}
                      >
                        Open Election
                      </Button>
                    ) : election?.status === 'OPEN' ? (
                      <Button
                        className="flex-1 text-white"
                        style={{ backgroundColor: "#dc2626" }}
                        onClick={() => {
                          // TODO: Implement close election
                          alert('Close election functionality coming soon');
                        }}
                      >
                        Close Election
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      className="flex-1 cursor-pointer"
                      onClick={() => {
                        router.push('/admin/election-management');
                      }}
                    >
                      Manage Election
                    </Button>
                  </div>
                  {lastTransaction?.txId && (
                    <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
                      <span className="font-medium">Last chain transaction:</span>{" "}
                      <span className="font-mono">TxID #{lastTransaction.txId.slice(0, 8)}</span>
                      {" "}({new Date(lastTransaction.createdAt).toLocaleTimeString()})
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Voter Turnout Card */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Voter Turnout</CardTitle>

                    <Tabs
                      value={activeTab}
                      onValueChange={(val) => setActiveTab(val as "overall" | "breakdown")}
                      className="w-auto"
                    >
                      <TabsList>
                        <TabsTrigger
                          value="overall"
                          className={activeTab === "overall" ? "cursor-default" : "cursor-pointer"}
                        >
                          Overall
                        </TabsTrigger>

                        <TabsTrigger
                          value="breakdown"
                          className={activeTab === "breakdown" ? "cursor-default" : "cursor-pointer"}
                        >
                          Breakdown
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="overall">
                    <TabsContent value="overall" className="mt-4">
                      <div className="flex flex-col items-center justify-center md:flex-row items-center gap-6">
                        <div className="relative items-center justify-center w-48 h-48 mx-auto">
                          <Doughnut
                            data={{
                              labels: ["Voted", "Not Yet Voted"],
                              datasets: [
                                {
                                  data: [stats.votedCount, stats.notVotedCount],
                                  backgroundColor: ["#0C8C3F", "#e5e7eb"],
                                  borderWidth: 0,
                                },
                              ],
                            }}
                            options={{
                              responsive: true,
                              maintainAspectRatio: true,
                              cutout: "70%",
                              plugins: {
                                legend: { display: false },
                              },
                            }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="text-center">
                              <div className="text-3xl font-bold">{stats.votedCount}</div>
                              <div className="text-sm text-muted-foreground">Voted</div>
                            </div>
                          </div>
                        </div>
                        <div className="flex-1 w-full">
                          <p className="text-lg font-semibold mb-4" style={{ color: "#0C8C3F" }}>
                            {stats.votedCount} out of {stats.totalVoters} CAS Students
                          </p>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 rounded" style={{ backgroundColor: "#0C8C3F" }}></div>
                              <span className="text-sm text-muted-foreground">Voted {stats.votedCount}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 bg-muted rounded"></div>
                              <span className="text-sm text-muted-foreground">Not Yet Voted {stats.notVotedCount}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </TabsContent>
                    <TabsContent value="breakdown" className="mt-4">
                      <div className="space-y-4">
                        <GroupBreakdownChart groups={groups} />
                        <div className="space-y-3">
                          {groups.map((group) => (
                            <div key={group.name} className="flex items-center justify-between p-3 border rounded-lg">
                              <div className="flex items-center gap-3">
                                <div className="w-4 h-4 rounded" style={{ backgroundColor: group.color }}></div>
                                <span className="font-medium">{group.name}</span>
                              </div>
                              <span className="text-sm text-muted-foreground">
                                {group.voted} out of {group.total}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}