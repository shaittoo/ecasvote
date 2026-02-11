"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Bell, Settings, HelpCircle, Menu, LogOut, Home, FileText, BarChart3, Shield, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchDashboard, fetchElection, fetchPositions, fetchResults, fetchAuditLogs, fetchIntegrityCheck } from "@/lib/ecasvoteApi";
import type { Position, AuditLog, IntegrityCheckData } from "@/lib/ecasvoteApi";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Sidebar from "./components/sidebar";

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const ELECTION_ID = 'election-2025';

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

export default function ValidatorDashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [results, setResults] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [integrityData, setIntegrityData] = useState<IntegrityCheckData | null>(null);
  const [integrityLoading, setIntegrityLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overall" | "breakdown">("overall");

  const groups = [
    { name: "Red Bolts", voted: 184, total: 200, color: "#dc2626" },
    { name: "Skimmers", voted: 252, total: 300, color: "#9333ea" },
    { name: "Elektrons", voted: 380, total: 500, color: "#ea580c" },
    { name: "Clovers", voted: 74, total: 200, color: "#16a34a" },
  ];

  useEffect(() => {
    async function loadData() {
      try {
        const [dashboard, positionsData, resultsData, auditData] = await Promise.all([
          fetchDashboard(ELECTION_ID).catch(() => null),
          fetchPositions(ELECTION_ID).catch(() => []),
          fetchResults(ELECTION_ID).catch(() => null),
          fetchAuditLogs(ELECTION_ID).catch(() => ({ logs: [], count: 0 })),
        ]);

        setDashboardData(dashboard);
        setPositions(positionsData || []);
        setResults(resultsData);
        setAuditLogs(auditData?.logs || []);
      } catch (err) {
        console.error('Failed to load validator data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Load integrity check data only when integrity tab is active
  const loadIntegrityData = async () => {
    setIntegrityLoading(true);
    try {
      const integrityCheckData = await fetchIntegrityCheck(ELECTION_ID);
      setIntegrityData(integrityCheckData);
    } catch (err) {
      console.error('Failed to load integrity check data:', err);
      setIntegrityData(null);
    } finally {
      setIntegrityLoading(false);
    }
  };

  const handleLogout = () => {
    router.push("/login");
  };

  const stats = dashboardData?.statistics || { totalVoters: 0, votedCount: 0, notVotedCount: 0 };
  const election = dashboardData?.election;

  // Prepare voter turnout chart data
  const voterTurnoutData = {
    labels: ['Voted', 'Not Yet Voted'],
    datasets: [
      {
        data: [stats.votedCount, stats.notVotedCount],
        backgroundColor: ['#0C8C3F', '#e5e7eb'],
        borderWidth: 0,
      },
    ],
  };

  // Prepare results chart data
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
            label: 'Votes',
            data: votes,
            backgroundColor: '#7A0019',
            borderRadius: 4,
          },
        ],
      },
    };
  });

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />

      {/* Main Content */}
      <main className="flex-1 p-2 overflow-y-auto">
          <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle>Hello, Validator!</CardTitle>
                    <Badge variant="secondary" className="bg-blue-500 text-white">
                      Validator
                    </Badge>
                  </div>
                  <CardDescription>
                  Welcome to UPV CAS Student Council's Online Voting System
                  </CardDescription>
                </CardHeader>
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
  );
}

                  

