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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchDashboard, fetchElection, fetchPositions, fetchResults, fetchAuditLogs, fetchIntegrityCheck } from "@/lib/ecasvoteApi";
import type { Position, AuditLog, IntegrityCheckData } from "@/lib/ecasvoteApi";
import { ValidatorSidebar } from "@/components/Sidebar";
import ValidatorHeader from "./components/header";

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const ELECTION_ID = 'election-2025';

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

  const sidebarUserName = "Validator";

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
      <ValidatorSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        active="overview"
        userName={sidebarUserName}
        onLogout={handleLogout}
        fixed
        pathname={pathname}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <ValidatorHeader 
          title="Validator Dashboard" 
          subtitle="Monitor and verify election integrity"
          sidebarOpen={sidebarOpen}
        />
        <main className={`flex-1 p-2 overflow-y-auto transition-all duration-300 ${
          sidebarOpen ? "ml-64" : "ml-20"
        }`}>
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

              {/* Election Information */}
              {election && (
                <Card>
                  <CardHeader>
                    <CardTitle>Election Information</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm text-gray-600">Election Name</p>
                        <p className="font-semibold text-lg">{election.name}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-600">Status</p>
                          <Badge
                            className={
                              election.status === "OPEN"
                                ? "bg-green-500 text-white"
                                : election.status === "CLOSED"
                                ? "bg-red-500 text-white"
                                : "bg-gray-500 text-white"
                            }
                          >
                            {election.status}
                          </Badge>
                        </div>

                        <div>
                          <p className="text-sm text-gray-600">Description</p>
                          <p className="font-medium">
                            {election.description || "N/A"}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-600">Start Time</p>
                          <p className="font-medium">
                            {new Date(election.startTime).toLocaleString("en-US", {
                              timeZone: "Asia/Manila",
                            })}
                          </p>
                        </div>

                        <div>
                          <p className="text-sm text-gray-600">End Time</p>
                          <p className="font-medium">
                            {new Date(election.endTime).toLocaleString("en-US", {
                              timeZone: "Asia/Manila",
                            })}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}



