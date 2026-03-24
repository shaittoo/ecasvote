"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  fetchElection,
  fetchElections,
  fetchPositions,
  fetchIntegrityCheck,
} from "@/lib/ecasvoteApi";
import type { Election, Position, IntegrityCheckData } from "@/lib/ecasvoteApi";
import { AdminSidebar } from "@/components/Sidebar";
import AdminHeader from "../../components/header";

export default function AdminIntegrityCheckPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [elections, setElections] = useState<Election[]>([]);
  const [electionId, setElectionId] = useState("");
  const [electionsLoading, setElectionsLoading] = useState(true);
  const [election, setElection] = useState<any>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [integrityData, setIntegrityData] = useState<IntegrityCheckData | null>(null);
  const [integrityLoading, setIntegrityLoading] = useState(false);
  const [loading, setLoading] = useState(true);
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

    setElectionsLoading(true);
    fetchElections()
      .then((list) => {
        setElections(list);
        if (list.length > 0) {
          setElectionId((prev) =>
            prev && list.some((e) => e.id === prev) ? prev : list[0].id
          );
        }
      })
      .catch(() => setElections([]))
      .finally(() => setElectionsLoading(false));
  }, []);

  // Load election, positions, and integrity when selection changes
  useEffect(() => {
    if (!electionId) {
      setIntegrityData(null);
      setElection(null);
      setPositions([]);
      if (!electionsLoading) setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setIntegrityLoading(true);
      try {
        const [electionData, positionsData, integrityCheckData] = await Promise.all([
          fetchElection(electionId).catch(() => null),
          fetchPositions(electionId).catch(() => []),
          fetchIntegrityCheck(electionId),
        ]);
        if (cancelled) return;
        setElection(electionData);
        setPositions(positionsData || []);
        setIntegrityData(integrityCheckData);
      } catch (err) {
        console.error("Failed to load integrity check data:", err);
        if (!cancelled) setIntegrityData(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setIntegrityLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [electionId, electionsLoading]);

  const loadIntegrityData = async () => {
    if (!electionId) return;
    setIntegrityLoading(true);
    try {
      const integrityCheckData = await fetchIntegrityCheck(electionId);
      setIntegrityData(integrityCheckData);
    } catch (err) {
      console.error("Failed to load integrity check data:", err);
      setIntegrityData(null);
    } finally {
      setIntegrityLoading(false);
    }
  };

  const handleLogout = () => {
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
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
          title="Integrity Check" 
          subtitle="Verify blockchain and database synchronization"
          sidebarOpen={sidebarOpen} 
        />

        {/* Main Content Area */}
        <main className={`flex-1 p-6 overflow-y-auto transition-all duration-300 ${
          sidebarOpen ? "ml-64" : "ml-20"
        }`}>
          <div className="w-full max-w-7xl mx-auto space-y-6">
              <select
                id="admin-integrity-election"
                className="h-10 w-full min-w-0 sm:max-w-md rounded-md border border-input bg-background px-3 text-sm shadow-sm cursor-pointer"
                value={electionId}
                disabled={electionsLoading || elections.length === 0}
                onChange={(e) => setElectionId(e.target.value)}
              >
                {electionsLoading ? (
                  <option value="">Loading elections…</option>
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

          {electionsLoading || loading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {electionsLoading ? "Loading elections…" : "Loading integrity data…"}
              </p>
            </div>
          ) : !electionId ? (
            <div className="text-center py-12 text-muted-foreground">
              Select or create an election to run the integrity check.
            </div>
          ) : (
            <>
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
                      Failed to load integrity check data
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
                      Failed to load comparison data
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
                      Please investigate immediately. The blockchain record is the source of truth.
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
          </div>
        </main>
      </div>
    </div>
  );
}

