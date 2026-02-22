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
import { AdminSidebar } from "@/components/Sidebar";
import AdminHeader from "./components/header";
import GreetingCard from "@/components/greeting-card";
import VoterTurnoutTabs from "./components/voter-turnout/tabs-turnout";

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
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overall" | "breakdown">("overall");

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
      <AdminSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        active="dashboard"
        userName="John"
        onLogout={handleLogout}
        fixed
        pathname={pathname}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <AdminHeader 
          title="Admin Dashboard" 
          subtitle="Overview of election activities and statistics"
          sidebarOpen={sidebarOpen}
        />
        {/* Main Content Area */}
        <main className={`flex-1 p-2 overflow-y-auto transition-all duration-300 ${
          sidebarOpen ? "ml-64" : "ml-20"
        }`}>
          <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="space-y-6">
              <GreetingCard name="John" role="SEB Admin" roleColor="#7A0019" />

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
              <VoterTurnoutTabs stats={stats} groups={groups} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}