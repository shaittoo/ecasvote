"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

import {
  fetchIntegrityCheck,
  fetchPositions,
} from "@/lib/ecasvoteApi";

import type {
  IntegrityCheckData,
  Position,
} from "@/lib/ecasvoteApi";
import { ValidatorSidebar } from "@/components/sidebars/Sidebar";

const ELECTION_ID = "election-2025";

export default function ValidatorIntegrityPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [integrityData, setIntegrityData] =
    useState<IntegrityCheckData | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadIntegrityData() {
    setLoading(true);
    setError(null);
    try {
      const [integrity, positionsData] = await Promise.all([
        fetchIntegrityCheck(ELECTION_ID),
        fetchPositions(ELECTION_ID),
      ]);

      setIntegrityData(integrity);
      setPositions(positionsData || []);
    } catch (error) {
      console.error("Failed to load integrity data:", error);
      setError(error instanceof Error ? error.message : "Failed to load integrity check data");
      setIntegrityData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadIntegrityData();
  }, []);

  const handleLogout = () => {
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <ValidatorSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        active="integrity"
        userName="Validator"
        onLogout={handleLogout}
        fixed
        pathname={pathname}
      />

      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className={`bg-white border-b border-gray-200 px-6 py-5 transition-all duration-300 ${
          sidebarOpen ? "ml-64" : "ml-20"
        }`}>
          <h1 className="text-2xl font-semibold text-gray-900">
            Integrity Check
          </h1>
        </header>

        {/* Main */}
        <main className={`flex-1 p-6 space-y-6 overflow-y-auto transition-all duration-300 ${
          sidebarOpen ? "ml-64" : "ml-20"
        }`}>
          {/* Summary Card */}
          {loading ? (
            <Card>
              <CardContent className="py-12 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-4"></div>
                <p className="text-gray-500">
                  Loading integrity verification...
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  This may take a few seconds while we query the blockchain
                </p>
              </CardContent>
            </Card>
          ) : error ? (
            <Card className="border-red-200 bg-red-50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  <CardTitle className="text-red-900">Failed to Load</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-red-800 mb-4">{error}</p>
                <Button 
                  variant="outline"
                  onClick={loadIntegrityData}
                  className="border-red-300 text-red-600 hover:bg-red-100"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry
                </Button>
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
                      disabled={loading}
                    >
                      <RefreshCw
                        className={`w-4 h-4 mr-2 ${
                          loading ? "animate-spin" : ""
                        }`}
                      />
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
                    <p className="text-sm text-gray-600 mb-1">
                      Blockchain Votes
                    </p>
                    <p className="text-2xl font-bold">
                      {integrityData.totals.blockchain}
                    </p>
                  </div>

                  <div className="border rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-1">
                      Database Votes
                    </p>
                    <p className="text-2xl font-bold">
                      {integrityData.totals.database}
                    </p>
                  </div>

                  <div className="border rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-1">Status</p>
                    {integrityData.totals.match ? (
                      <p className="text-lg font-semibold text-green-600">
                        ✓ Match
                      </p>
                    ) : (
                      <p className="text-lg font-semibold text-red-600">
                        ✗ Mismatch
                      </p>
                    )}
                  </div>
                </div>

                <p className="text-xs text-gray-500 mt-4">
                  Last verified:{" "}
                  {new Date(integrityData.timestamp).toLocaleString(
                    "en-US",
                    { timeZone: "Asia/Manila" }
                  )}
                </p>
              </CardContent>
            </Card>
          )}

          {/* On-Chain Vote Count */}
          {integrityData && (
            <Card>
              <CardHeader>
                <CardTitle>On-Chain Vote Count Verification</CardTitle>
                <CardDescription>
                  Vote counts directly from the blockchain
                </CardDescription>
              </CardHeader>

              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-semibold">
                          Position
                        </th>
                        <th className="text-left py-3 px-4 font-semibold">
                          Candidate
                        </th>
                        <th className="text-right py-3 px-4 font-semibold">
                          Count from Blockchain
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {integrityData.comparison.map((item, index) => {
                        const position = positions.find(
                          (p) => p.id === item.position
                        );
                        const candidate =
                          position?.candidates?.find(
                            (c) => c.id === item.candidate
                          );

                        return (
                          <tr
                            key={index}
                            className="border-b border-gray-100 hover:bg-gray-50"
                          >
                            <td className="py-3 px-4 font-medium">
                              {position?.name ||
                                item.position.replace(/-/g, " ")}
                            </td>
                            <td className="py-3 px-4">
                              {candidate?.name || item.candidate}
                            </td>
                            <td className="py-3 px-4 text-right font-semibold">
                              {item.blockchainCount}
                            </td>
                          </tr>
                        );
                      })}

                      {integrityData.comparison.length === 0 && (
                        <tr>
                          <td
                            colSpan={3}
                            className="py-12 text-center text-gray-500"
                          >
                            No votes recorded yet
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Off-Chain Comparison */}
          {integrityData && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Off-Chain Vote Record Count
                </CardTitle>
                <CardDescription>
                  Comparison between Prisma database and blockchain
                </CardDescription>
              </CardHeader>

              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-semibold">
                          Position
                        </th>
                        <th className="text-left py-3 px-4 font-semibold">
                          Candidate
                        </th>
                        <th className="text-right py-3 px-4 font-semibold">
                          Stored in Prisma
                        </th>
                        <th className="text-right py-3 px-4 font-semibold">
                          Stored in Blockchain
                        </th>
                        <th className="text-center py-3 px-4 font-semibold">
                          Status
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {integrityData.comparison.map((item, index) => {
                        const position = positions.find(
                          (p) => p.id === item.position
                        );
                        const candidate =
                          position?.candidates?.find(
                            (c) => c.id === item.candidate
                          );

                        return (
                          <tr
                            key={index}
                            className={`border-b border-gray-100 hover:bg-gray-50 ${
                              !item.match ? "bg-red-50" : ""
                            }`}
                          >
                            <td className="py-3 px-4 font-medium">
                              {position?.name ||
                                item.position.replace(/-/g, " ")}
                            </td>
                            <td className="py-3 px-4">
                              {candidate?.name || item.candidate}
                            </td>
                            <td className="py-3 px-4 text-right">
                              {item.databaseCount}
                            </td>
                            <td className="py-3 px-4 text-right">
                              {item.blockchainCount}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {item.match ? (
                                <Badge className="bg-green-500 text-white">
                                  ✓ Match
                                </Badge>
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
                          <td
                            colSpan={5}
                            className="py-12 text-center text-gray-500"
                          >
                            No votes recorded yet
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Warning */}
          {integrityData && integrityData.hasMismatch && (
            <Card className="border-red-200 bg-red-50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  <CardTitle className="text-red-900">
                    Warning: Data Mismatch Detected
                  </CardTitle>
                </div>
              </CardHeader>

              <CardContent>
                <p className="text-red-800">
                  There is a discrepancy between the blockchain and database records.
                </p>

                <ul className="list-disc list-inside mt-2 text-red-800 space-y-1">
                  <li>Database synchronization issues</li>
                  <li>Potential data manipulation</li>
                  <li>Incomplete transaction processing</li>
                </ul>

                <p className="text-red-800 mt-4 font-semibold">
                  Please investigate immediately.
                </p>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}