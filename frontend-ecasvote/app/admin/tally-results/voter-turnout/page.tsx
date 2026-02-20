"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Doughnut, Bar, Line } from "react-chartjs-2";
import { fetchDashboard, fetchElection } from "@/lib/ecasvoteApi";
import { AdminSidebar } from "@/components/sidebars/Sidebar";
import AdminHeader from "../../components/header";

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

const ELECTION_ID = 'election-2025';
const API_BASE = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:4000';

interface TurnoutStats {
  totalVoters: number;
  votedCount: number;
  notVotedCount: number;
  byDepartment: Array<{ name: string; total: number; voted: number; notVoted: number }>;
  byYearLevel: Array<{ yearLevel: number; total: number; voted: number; notVoted: number }>;
  byProgram: Array<{ program: string; total: number; voted: number; notVoted: number }>;
}

interface HourlyParticipation {
  hourlyData: Array<{ hour: string; count: number }>;
  peakHour: { time: string; count: number };
  slowestHour: { time: string; count: number };
  totalVotes: number;
}

export default function VoterTurnoutPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedElection, setSelectedElection] = useState("CAS SC Elections 2026");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [turnoutStats, setTurnoutStats] = useState<TurnoutStats | null>(null);
  const [hourlyData, setHourlyData] = useState<HourlyParticipation | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminInfo, setAdminInfo] = useState<any>(null);
  const [elections, setElections] = useState<any[]>([]);

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
        // Load current election
        const election = await fetchElection(ELECTION_ID);
        if (election) {
          setSelectedElection(election.name || "CAS SC Elections 2026");
        }

        // Load turnout stats
        const statsRes = await fetch(`${API_BASE}/elections/${ELECTION_ID}/turnout`);
        if (!statsRes.ok) {
          throw new Error(`Failed to fetch turnout stats: ${statsRes.status} ${statsRes.statusText}`);
        }
        const stats = await statsRes.json();
        setTurnoutStats(stats);

        // Load hourly participation
        const hourlyRes = await fetch(`${API_BASE}/elections/${ELECTION_ID}/hourly-participation?date=${selectedDate}`);
        if (!hourlyRes.ok) {
          // If hourly data fails, set empty data instead of throwing
          console.warn(`Failed to fetch hourly participation: ${hourlyRes.status} ${hourlyRes.statusText}`);
          setHourlyData({
            hourlyData: [],
            peakHour: { time: '00:00', count: 0 },
            slowestHour: { time: '00:00', count: 0 },
            totalVotes: 0,
          });
        } else {
          const hourly = await hourlyRes.json();
          setHourlyData(hourly);
        }
      } catch (err) {
        console.error('Failed to load voter turnout data:', err);
        // Set default values on error
        setTurnoutStats({
          totalVoters: 0,
          votedCount: 0,
          notVotedCount: 0,
          byDepartment: [],
          byYearLevel: [],
          byProgram: [],
        });
        setHourlyData({
          hourlyData: [],
          peakHour: { time: '00:00', count: 0 },
          slowestHour: { time: '00:00', count: 0 },
          totalVotes: 0,
        });
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [selectedDate]);

  const handleLogout = () => {
    router.push("/login");
  };

  // Calculate data from stats
  const totalVoters = turnoutStats?.totalVoters || 0;
  const votedCount = turnoutStats?.votedCount || 0;
  const notVotedCount = turnoutStats?.notVotedCount || 0;
  const votedPercentage = totalVoters > 0 ? ((votedCount / totalVoters) * 100).toFixed(1) : '0.0';

  // Department data with colors
  const departmentColors: Record<string, string> = {
    'Elektrons': '#ea580c',
    'Redbolts': '#dc2626',
    'Skimmers': '#9333ea',
    'Clovers': '#16a34a',
  };

  const groupsData = (turnoutStats?.byDepartment || []).map(dept => ({
    name: dept.name,
    voted: dept.voted,
    total: dept.total,
    color: departmentColors[dept.name] || '#6b7280',
  }));

  // Hourly participation data
  const hourlyChartData = hourlyData ? {
    labels: hourlyData.hourlyData.map(d => {
      const hour = parseInt(d.hour.split(':')[0]);
      return hour.toString().padStart(2, '0') + ':00';
    }),
    datasets: [
      {
        label: "Votes",
        data: hourlyData.hourlyData.map(d => d.count),
        borderColor: "#2563eb",
        backgroundColor: "rgba(37, 99, 235, 0.1)",
        tension: 0.4,
        fill: true,
        pointRadius: 5,
        pointBackgroundColor: "#2563eb",
      },
    ],
  } : {
    labels: [],
    datasets: [],
  };

  // Doughnut chart data
  const doughnutData = {
    labels: ["Voted", "Not Yet Voted"],
    datasets: [
      {
        data: [votedCount, notVotedCount],
        backgroundColor: ["#16a34a", "#e5e7eb"],
        borderWidth: 0,
      },
    ],
  };

  // Format date for display
  const formatDateForDisplay = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  // Get available dates (last 7 days)
  const getAvailableDates = () => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      dates.push(date.toISOString().split('T')[0]);
    }
    return dates.reverse();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <style jsx global>{`button { cursor: pointer; }`}</style>
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
        <AdminHeader title="Voter Turnout" sidebarOpen={sidebarOpen} />

        {/* Main Content Area */}
        <main className={`flex-1 p-6 overflow-y-auto transition-all duration-300 ${
          sidebarOpen ? "ml-64" : "ml-20"
        }`}>
          {loading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Loading voter turnout data...</p>
            </div>
          ) : (
            <div className="w-full max-w-7xl mx-auto space-y-6">
              {/* Overall and Breakdown Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Overall Section */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Overall</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col items-center justify-center">
                      <div className="relative w-56 h-56 flex items-center justify-center">
                        <div className="absolute inset-0 flex items-center justify-center z-10">
                          <div className="text-center">
                            <div className="text-4xl font-bold text-green-600">
                              {votedPercentage}%
                            </div>
                            <div className="text-xs text-gray-600">Voted</div>
                          </div>
                        </div>
                        <Doughnut
                          data={doughnutData}
                          options={{
                            responsive: true,
                            maintainAspectRatio: true,
                            cutout: "70%",
                            plugins: {
                              legend: {
                                display: true,
                                position: "bottom" as const,
                              },
                            },
                          }}
                        />
                      </div>
                      <div className="mt-6 text-center text-sm text-gray-700">
                        {votedCount} out of {totalVoters} CAS Students
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Breakdown Section */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {groupsData.map((group) => {
                        const percentage = group.total > 0 ? ((group.voted / group.total) * 100).toFixed(0) : '0';
                        return (
                          <div key={group.name} className="flex items-center gap-3">
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-gray-700">
                                  {group.name}
                                </span>
                                <span className="text-xs text-gray-600">
                                  {percentage}%
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    backgroundColor: group.color,
                                    width: `${percentage}%`,
                                  }}
                                />
                              </div>
                              <div className="text-xs text-gray-600 mt-1">
                                {group.voted} out of {group.total}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-4 text-center text-sm text-gray-700">
                      {votedCount} out of {totalVoters} CAS Students
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Hourly Participation Trend */}
              <Card>
                <CardHeader className="flex items-center justify-between flex-row">
                  <CardTitle className="text-lg">Hourly Participation Trend</CardTitle>
                  <div className="relative group">
                    <select 
                      className="w-full border rounded px-3 py-2" 
                      value={selectedDate} 
                      onChange={(e) => setSelectedDate(e.target.value)}
                    >
                      {getAvailableDates().map(date => (
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
                                y: {
                                  beginAtZero: true,
                                  ticks: {
                                    stepSize: hourlyData.peakHour.count > 10 ? 5 : 1,
                                  },
                                },
                              },
                            }}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col justify-center">
                        <h4 className="font-semibold text-gray-900 mb-4">Key Insights:</h4>
                        <div className="space-y-3">
                          <div className="flex items-start gap-2">
                            <span className="text-sm font-medium text-gray-600 min-w-fit">
                              Peak Hour:
                            </span>
                            <span className="text-sm text-gray-700">
                              {hourlyData.peakHour.time} ({hourlyData.peakHour.count} {hourlyData.peakHour.count === 1 ? 'vote' : 'votes'})
                            </span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-sm font-medium text-gray-600 min-w-fit">
                              Slowest Hour:
                            </span>
                            <span className="text-sm text-gray-700">
                              {hourlyData.slowestHour.time} ({hourlyData.slowestHour.count} {hourlyData.slowestHour.count === 1 ? 'vote' : 'votes'})
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      No hourly participation data available for this date.
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