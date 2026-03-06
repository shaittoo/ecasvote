"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Download, Printer } from "lucide-react";
import { fetchAuditLogs } from "@/lib/ecasvoteApi";
import type { AuditLog } from "@/lib/ecasvoteApi";
import { ValidatorSidebar } from "@/components/Sidebar";
import ValidatorHeader from "../components/header";
import { exportAuditLogsCSV, printAuditTable } from "../../admin/audit-and-logs/audit-trail/export";

const ELECTION_ID = "election-2025";

export default function ValidatorAuditLogsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  useEffect(() => {
    async function loadLogs() {
      try {
        const response = await fetchAuditLogs(ELECTION_ID);
        setAuditLogs(response.logs || []);
      } catch (error) {
        console.error("Failed to load audit logs:", error);
        setAuditLogs([]);
      } finally {
        setLoading(false);
      }
    }

    loadLogs();
  }, []);

  const handleLogout = () => {
    router.push("/login");
  };

  const filteredLogs = auditLogs.filter((log) => {
    const timestamp = new Date(log.createdAt).toLocaleString("en-US", { timeZone: "Asia/Manila" });
    return (
      (log.txId ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (log.voterId ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (log.action ?? "").toLowerCase().includes(search.toLowerCase()) ||
      timestamp.toLowerCase().includes(search.toLowerCase()) ||
      JSON.stringify(log.details ?? {}).toLowerCase().includes(search.toLowerCase())
    );
  });

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;
  const totalPages = Math.ceil(filteredLogs.length / rowsPerPage);
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <ValidatorSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        active="audit"
        userName="Validator"
        onLogout={handleLogout}
        fixed
        pathname={pathname}
      />

      <div className="flex-1 flex flex-col">
        <ValidatorHeader 
          title="Audit Logs" 
          subtitle="Complete transaction history and system activities"
          sidebarOpen={sidebarOpen} 
        />

        <main className={`flex-1 p-6 overflow-y-auto transition-all duration-300 ${sidebarOpen ? "ml-64" : "ml-20"}`}>
          <div className="flex flex-col space-y-4 mb-4 max-w-7xl">
            {/* Search + Export */}
            <div className="flex flex-wrap items-center gap-4 pl-90">
              <div className="relative flex-1 max-w-10xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  placeholder="Search by TxID, Action, Voter, Timestamp..."
                  className="w-full pl-10 pr-4"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {filteredLogs.length} results
                </span>
              </div>

              <button
                className="flex items-center px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 cursor-pointer"
                onClick={() => exportAuditLogsCSV(filteredLogs)}
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </button>

              <button
                className="flex items-center px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 cursor-pointer"
                onClick={() => printAuditTable("validator-audit-table", "Audit Logs")}
              >
                <Printer className="h-4 w-4 mr-2" />
                Print
              </button>
            </div>
          </div>

          <Card>
            <CardContent>
              {loading ? (
                <div className="py-12 text-center text-gray-500">
                  Loading audit logs...
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table id="validator-audit-table" className="w-full border-collapse">
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
                      {filteredLogs.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-gray-500">
                            No audit logs found
                          </td>
                        </tr>
                      ) : (
                        filteredLogs.map((log) => (
                          <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-3 px-4 text-sm">
                              {new Date(log.createdAt).toLocaleString("en-US", { timeZone: "Asia/Manila" })}
                            </td>
                            <td className="py-3 px-4"><Badge variant="outline">{log.action}</Badge></td>
                            <td className="py-3 px-4 text-sm text-gray-600">{log.voterId || "N/A"}</td>
                            <td className="py-3 px-4 text-sm font-mono text-gray-600">
                              {log.txId ? `${log.txId.substring(0, 20)}...` : "N/A"}
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-600">
                              {log.details ? JSON.stringify(log.details).substring(0, 50) + "..." : "N/A"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              {filteredLogs.length > 0 && (
                    <div className="flex justify-center mt-4 gap-2 text-sm text-gray-600">
                      <button
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage((p) => p - 1)}
                        className="px-2 py-1 border rounded disabled:opacity-50"
                      >
                        Prev
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => (
                        <button
                          key={i}
                          className={`px-2 py-1 border rounded ${currentPage === i + 1 ? "bg-gray-200" : ""}`}
                          onClick={() => setCurrentPage(i + 1)}
                        >
                          {i + 1}
                        </button>
                      ))}
                      <button
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage((p) => p + 1)}
                        className="px-2 py-1 border rounded disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  )}

                  {selectedLog && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center">
                      <div
                        className="absolute inset-0 bg-black/50"
                        onClick={() => setSelectedLog(null)}
                      />
                      <div className="relative bg-white rounded-lg w-full max-w-2xl p-6 mx-4">
                        <div className="flex items-start justify-between">
                          <h3 className="text-2xl font-semibold text-[#7A0019]">
                            Transaction Details
                          </h3>
                          <button
                            className="text-gray-600 hover:text-gray-900 text-xl font-bold cursor-pointer"
                            onClick={() => setSelectedLog(null)}
                          >
                            ✕
                          </button>
                        </div>

                        <div className="mt-4 space-y-2 text-sm text-gray-700">
                          <p><strong>TxID:</strong> {selectedLog.txId}</p>
                          <p><strong>Block:</strong> {selectedLog.details?.blockNumber || "-"}</p>
                          <p><strong>Function:</strong> {selectedLog.details?.function || selectedLog.action}</p>
                          <p><strong>Validation:</strong> {selectedLog.details?.validation || "-"}</p>
                          <p><strong>Time:</strong> {new Date(selectedLog.createdAt).toLocaleString()}</p>
                          <p><strong>Positions:</strong></p>
                          {selectedLog.details?.selections?.length ? (
                            <ul className="list-disc pl-5">
                              {selectedLog.details.selections.map((sel: any, idx: number) => (
                                <li key={idx}>
                                  {sel.positionId} → {sel.candidateId}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p>-</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}