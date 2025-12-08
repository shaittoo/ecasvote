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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, Bell, Settings, HelpCircle, Menu, LogOut, Home, FileText, BarChart3, Shield, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchDashboard, fetchElection, fetchPositions, fetchResults, fetchAuditLogs, fetchIntegrityCheck } from "@/lib/ecasvoteApi";
import type { Position, AuditLog, IntegrityCheckData } from "@/lib/ecasvoteApi";

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
  const [activeTab, setActiveTab] = useState<'overview' | 'candidates' | 'results' | 'audit' | 'integrity'>('overview');

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

  useEffect(() => {
    if (activeTab === 'integrity' && !integrityData && !integrityLoading) {
      loadIntegrityData();
    }
  }, [activeTab]);

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
      {/* Left Sidebar */}
      <aside
        className={`bg-white border-r border-gray-200 transition-all duration-300 flex flex-col fixed left-0 top-0 h-screen z-30 ${
          sidebarOpen ? "w-64" : "w-20"
        }`}
      >
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          {sidebarOpen ? (
            <div className="flex items-center gap-2">
              <Image
                src="/ecasvotelogo.jpeg"
                alt="eCASVote Logo"
                width={40}
                height={40}
                className="rounded"
              />
            </div>
          ) : (
            <Image
              src="/ecasvotelogo.jpeg"
              alt="eCASVote Logo"
              width={40}
              height={40}
              className="rounded mx-auto"
            />
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-4">
          <div
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors cursor-pointer mb-2 ${
              activeTab === 'overview' ? "bg-[#7A0019] text-white" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <Home className="w-5 h-5" />
            {sidebarOpen && <span className="font-medium">Dashboard</span>}
          </div>
          <div
            onClick={() => setActiveTab('candidates')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors cursor-pointer mb-2 ${
              activeTab === 'candidates' ? "bg-[#7A0019] text-white" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <FileText className="w-5 h-5" />
            {sidebarOpen && <span className="font-medium">Candidates</span>}
          </div>
          <div
            onClick={() => setActiveTab('results')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors cursor-pointer mb-2 ${
              activeTab === 'results' ? "bg-[#7A0019] text-white" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <BarChart3 className="w-5 h-5" />
            {sidebarOpen && <span className="font-medium">Results</span>}
          </div>
          <div
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors cursor-pointer mb-2 ${
              activeTab === 'audit' ? "bg-[#7A0019] text-white" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <Shield className="w-5 h-5" />
            {sidebarOpen && <span className="font-medium">Audit Logs</span>}
          </div>
          <div
            onClick={() => setActiveTab('integrity')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors cursor-pointer mb-2 ${
              activeTab === 'integrity' ? "bg-[#7A0019] text-white" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <CheckCircle2 className="w-5 h-5" />
            {sidebarOpen && <span className="font-medium">Integrity Check</span>}
          </div>
        </nav>

        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-[#7A0019] flex items-center justify-center text-white font-semibold">
              V
            </div>
            {sidebarOpen && (
              <div className="flex-1">
                <p className="font-medium text-sm">Validator</p>
                <p className="text-xs text-gray-500">Read-Only Access</p>
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 w-full"
          >
            <LogOut className="w-4 h-4" />
            {sidebarOpen && <span className="text-sm">Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className={`flex-1 transition-all duration-300 ${sidebarOpen ? "ml-64" : "ml-20"}`}>
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1">
            <Search className="w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search keyword or actions..."
              className="flex-1 border-none outline-none text-sm"
            />
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">Validator Dashboard</span>
            <Bell className="w-5 h-5 text-gray-400 cursor-pointer" />
            <Settings className="w-5 h-5 text-gray-400 cursor-pointer" />
            <HelpCircle className="w-5 h-5 text-gray-400 cursor-pointer" />
          </div>
        </header>

        {/* Main Content Area */}
        <main className="p-6">
          {loading ? (
            <div className="text-center py-12">Loading...</div>
          ) : (
            <>
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Greeting */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-2xl">Hello, Validator!</CardTitle>
                          <CardDescription className="mt-1">
                            Welcome to UPV CAS Student Council's Online Voting System
                          </CardDescription>
                        </div>
                        <Badge className="bg-blue-500 text-white">VALIDATOR</Badge>
                      </div>
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
                                  election.status === 'OPEN'
                                    ? 'bg-green-500 text-white'
                                    : election.status === 'CLOSED'
                                    ? 'bg-red-500 text-white'
                                    : 'bg-gray-500 text-white'
                                }
                              >
                                {election.status}
                              </Badge>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Description</p>
                              <p className="font-medium">{election.description || 'N/A'}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-sm text-gray-600">Start Time</p>
                              <p className="font-medium">
                                {new Date(election.startTime).toLocaleString('en-US', { timeZone: 'Asia/Manila' })}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">End Time</p>
                              <p className="font-medium">
                                {new Date(election.endTime).toLocaleString('en-US', { timeZone: 'Asia/Manila' })}
                              </p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Voter Turnout */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Voter Turnout</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-8">
                        <div className="w-48 h-48">
                          <Doughnut data={voterTurnoutData} options={{ maintainAspectRatio: false }} />
                        </div>
                        <div className="flex-1">
                          <p className="text-2xl font-bold mb-2">
                            {stats.votedCount} out of {stats.totalVoters} CAS Students
                          </p>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 bg-green-500 rounded"></div>
                              <span>Voted: {stats.votedCount}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 bg-gray-300 rounded"></div>
                              <span>Not Yet Voted: {stats.notVotedCount}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Candidates Tab */}
              {activeTab === 'candidates' && (
                <Card>
                  <CardHeader>
                    <CardTitle>Candidates</CardTitle>
                    <CardDescription>View all candidates for each position</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {positions.map((position) => (
                        <div key={position.id} className="border-b pb-4 last:border-b-0">
                          <h3 className="font-semibold text-lg mb-3">{position.name}</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {position.candidates?.map((candidate) => (
                              <div
                                key={candidate.id}
                                className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                              >
                                <p className="font-medium">{candidate.name}</p>
                                {candidate.party && (
                                  <p className="text-sm text-gray-600 mt-1">Party: {candidate.party}</p>
                                )}
                                {candidate.program && (
                                  <p className="text-sm text-gray-600">Program: {candidate.program}</p>
                                )}
                                {candidate.yearLevel && (
                                  <p className="text-sm text-gray-600">Year Level: {candidate.yearLevel}</p>
                                )}
                              </div>
                            ))}
                            {(!position.candidates || position.candidates.length === 0) && (
                              <p className="text-gray-500 text-sm">No candidates registered</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Results Tab */}
              {activeTab === 'results' && (
                <div className="space-y-6">
                  {resultsCharts.map((chart, idx) => (
                    <Card key={idx}>
                      <CardHeader>
                        <CardTitle>{chart.position}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-64">
                          <Bar data={chart.data} options={{ maintainAspectRatio: false }} />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {resultsCharts.length === 0 && (
                    <Card>
                      <CardContent className="py-12 text-center text-gray-500">
                        No results available yet
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* Audit Logs Tab */}
              {activeTab === 'audit' && (
                <Card>
                  <CardHeader>
                    <CardTitle>Audit Logs</CardTitle>
                    <CardDescription>Complete transaction history and system activities</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-3 px-4 font-semibold text-gray-900">Timestamp</th>
                            <th className="text-left py-3 px-4 font-semibold text-gray-900">Action</th>
                            <th className="text-left py-3 px-4 font-semibold text-gray-900">Voter ID</th>
                            <th className="text-left py-3 px-4 font-semibold text-gray-900">Transaction ID</th>
                            <th className="text-left py-3 px-4 font-semibold text-gray-900">Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {auditLogs.map((log) => (
                            <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="py-3 px-4 text-sm">
                                {new Date(log.createdAt).toLocaleString('en-US', { timeZone: 'Asia/Manila' })}
                              </td>
                              <td className="py-3 px-4">
                                <Badge variant="outline">{log.action}</Badge>
                              </td>
                              <td className="py-3 px-4 text-sm text-gray-600">
                                {log.voterId || 'N/A'}
                              </td>
                              <td className="py-3 px-4 text-sm font-mono text-gray-600">
                                {log.txId ? (
                                  <span className="text-xs">{log.txId.substring(0, 20)}...</span>
                                ) : (
                                  'N/A'
                                )}
                              </td>
                              <td className="py-3 px-4 text-sm text-gray-600">
                                {log.details ? JSON.stringify(log.details).substring(0, 50) + '...' : 'N/A'}
                              </td>
                            </tr>
                          ))}
                          {auditLogs.length === 0 && (
                            <tr>
                              <td colSpan={5} className="py-12 text-center text-gray-500">
                                No audit logs found
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Integrity Check Tab */}
              {activeTab === 'integrity' && (
                <div className="space-y-6">
                  {/* Summary Card */}
                  {integrityLoading ? (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-4"></div>
                        <p className="text-gray-500">Loading integrity verification...</p>
                        <p className="text-xs text-gray-400 mt-2">This may take a few seconds while we query the blockchain</p>
                      </CardContent>
                    </Card>
                  ) : integrityData && (
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle>Integrity Verification</CardTitle>
                            <CardDescription>
                              Compare blockchain vote counts with database records
                            </CardDescription>
                          </div>
                          <div className="flex items-center gap-3">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={loadIntegrityData}
                              disabled={integrityLoading}
                            >
                              <RefreshCw className={`w-4 h-4 mr-2 ${integrityLoading ? 'animate-spin' : ''}`} />
                              Refresh
                            </Button>
                            {integrityData.hasMismatch ? (
                              <Badge className="bg-red-500 text-white flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4" />
                                Mismatch Detected
                              </Badge>
                            ) : (
                              <Badge className="bg-green-500 text-white flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4" />
                                All Matches
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="border rounded-lg p-4">
                            <p className="text-sm text-gray-600 mb-1">Blockchain Votes</p>
                            <p className="text-2xl font-bold text-gray-900">{integrityData.totals.blockchain}</p>
                          </div>
                          <div className="border rounded-lg p-4">
                            <p className="text-sm text-gray-600 mb-1">Database Votes</p>
                            <p className="text-2xl font-bold text-gray-900">{integrityData.totals.database}</p>
                          </div>
                          <div className="border rounded-lg p-4">
                            <p className="text-sm text-gray-600 mb-1">Status</p>
                            {integrityData.totals.match ? (
                              <p className="text-lg font-semibold text-green-600">✓ Match</p>
                            ) : (
                              <p className="text-lg font-semibold text-red-600">✗ Mismatch</p>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-4">
                          Last verified: {new Date(integrityData.timestamp).toLocaleString('en-US', { timeZone: 'Asia/Manila' })}
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  {/* On-Chain Vote Count Verification */}
                  <Card>
                    <CardHeader>
                      <CardTitle>On-Chain Vote Count Verification</CardTitle>
                      <CardDescription>
                        Vote counts directly from the blockchain (immutable record)
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {integrityLoading ? (
                        <div className="text-center py-12 text-gray-500">
                          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-4"></div>
                          <p>Loading integrity check data...</p>
                        </div>
                      ) : integrityData ? (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-gray-200">
                                <th className="text-left py-3 px-4 font-semibold text-gray-900">Position</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-900">Candidate</th>
                                <th className="text-right py-3 px-4 font-semibold text-gray-900">Count from Blockchain</th>
                              </tr>
                            </thead>
                            <tbody>
                              {integrityData.comparison.map((item, index) => {
                                const position = positions.find(p => p.id === item.position);
                                const candidate = position?.candidates?.find(c => c.id === item.candidate);
                                const positionName = position?.name || item.position.replace(/-/g, ' ');
                                const candidateName = candidate?.name || item.candidate;
                                
                                return (
                                  <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                                    <td className="py-3 px-4 font-medium">{positionName}</td>
                                    <td className="py-3 px-4">{candidateName}</td>
                                    <td className="py-3 px-4 text-right font-semibold">{item.blockchainCount}</td>
                                  </tr>
                                );
                              })}
                              {integrityData.comparison.length === 0 && (
                                <tr>
                                  <td colSpan={3} className="py-12 text-center text-gray-500">
                                    No votes recorded yet
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-center py-12 text-gray-500">
                          Click to load integrity check data
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Off-Chain Vote Record Count Comparison */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Off-Chain Vote Record Count</CardTitle>
                      <CardDescription>
                        Comparison between Prisma database and blockchain records
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {integrityLoading ? (
                        <div className="text-center py-12 text-gray-500">
                          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-4"></div>
                          <p>Loading comparison data...</p>
                        </div>
                      ) : integrityData ? (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-gray-200">
                                <th className="text-left py-3 px-4 font-semibold text-gray-900">Position</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-900">Candidate</th>
                                <th className="text-right py-3 px-4 font-semibold text-gray-900">Stored in Prisma</th>
                                <th className="text-right py-3 px-4 font-semibold text-gray-900">Stored in Blockchain</th>
                                <th className="text-center py-3 px-4 font-semibold text-gray-900">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {integrityData.comparison.map((item, index) => {
                                const position = positions.find(p => p.id === item.position);
                                const candidate = position?.candidates?.find(c => c.id === item.candidate);
                                const positionName = position?.name || item.position.replace(/-/g, ' ');
                                const candidateName = candidate?.name || item.candidate;
                                
                                return (
                                  <tr 
                                    key={index} 
                                    className={`border-b border-gray-100 hover:bg-gray-50 ${
                                      !item.match ? 'bg-red-50' : ''
                                    }`}
                                  >
                                    <td className="py-3 px-4 font-medium">{positionName}</td>
                                    <td className="py-3 px-4">{candidateName}</td>
                                    <td className="py-3 px-4 text-right">{item.databaseCount}</td>
                                    <td className="py-3 px-4 text-right">{item.blockchainCount}</td>
                                    <td className="py-3 px-4 text-center">
                                      {item.match ? (
                                        <Badge className="bg-green-500 text-white">✓ Match</Badge>
                                      ) : (
                                        <Badge className="bg-red-500 text-white flex items-center justify-center gap-1">
                                          <AlertTriangle className="w-3 h-3" />
                                          Mismatch
                                        </Badge>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                              {integrityData.comparison.length === 0 && (
                                <tr>
                                  <td colSpan={5} className="py-12 text-center text-gray-500">
                                    No votes recorded yet
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-center py-12 text-gray-500">
                          Click to load comparison data
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Warning Message */}
                  {integrityData && integrityData.hasMismatch && (
                    <Card className="border-red-200 bg-red-50">
                      <CardHeader>
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5 text-red-600" />
                          <CardTitle className="text-red-900">Warning: Data Mismatch Detected</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-red-800">
                          There is a discrepancy between the blockchain records and the database records. 
                          This could indicate:
                        </p>
                        <ul className="list-disc list-inside mt-2 text-red-800 space-y-1">
                          <li>Database synchronization issues</li>
                          <li>Potential data manipulation</li>
                          <li>Incomplete transaction processing</li>
                        </ul>
                        <p className="text-red-800 mt-4 font-semibold">
                          Please investigate immediately and contact the system administrator.
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

