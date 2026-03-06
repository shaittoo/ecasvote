"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Download, Printer } from "lucide-react";
import StatCard from "../../components/statcard";
import { AdminSidebar } from "@/components/Sidebar";
import AdminHeader from "../../components/header";
import { fetchAuditLogs } from "@/lib/ecasvoteApi";
import type { AuditLog } from "@/lib/ecasvoteApi";
import { exportAuditLogsCSV, printAuditTable } from "./export";

export default function AuditTrailViewer() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [selectedElection] = useState("election-2025"); // change later
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Fetch logs on mount
  useEffect(() => {
    const loadLogs = async () => {
      try {
        const res = await fetchAuditLogs(selectedElection);
        if (res.ok) setAuditLogs(res.logs);
      } catch (err) {
        console.error("Failed to load audit logs", err);
      } finally {
        setLoading(false);
      }
    };
    loadLogs();
  }, [selectedElection]);

  const stats = {
    totalTransactions: auditLogs.length,
    totalBlocks: new Set(auditLogs.map((log) => log.details?.blockNumber)).size,
  };

  const handleLogout = () => router.push("/login");

  const filteredLogs = auditLogs.filter((log) => {
  const dateStr = new Date(log.createdAt).toLocaleString();
  return `${log.txId} ${log.action} ${log.voterId} ${log.electionId} ${log.details?.selections?.map((s) => `${s.positionId}-${s.candidateId}`).join(", ")} ${log.details?.function} ${dateStr}`
    .toLowerCase()
    .includes(search.toLowerCase());
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
      <AdminSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        active="audit"
        userName="John"
        onLogout={handleLogout}
        fixed
        pathname={pathname}
      />

      <div className="flex-1 flex flex-col">
        <AdminHeader title="Audit Trail Viewer" sidebarOpen={sidebarOpen} />

        <main
          className={`flex-1 p-6 overflow-y-auto transition-all duration-300 ${
            sidebarOpen ? "ml-64" : "ml-20"
          }`}
        >
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading audit logs...</div>
          ) : (
            <div className="max-w-7xl mx-auto space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <StatCard
                  title="Total Vote Transactions"
                  value={stats.totalTransactions}
                  color="text-gray-700"
                />
                <StatCard
                  title="Total Blocks"
                  value={stats.totalBlocks}
                  color="text-gray-700"
                />
              </div>

              {/* Search + Export + Table Card */}
              <Card>
                <CardHeader className="space-y-4">
                  <div className="flex items-center justify-between gap-4 w-full">
                    <div className="relative flex-1 max-w-6xl">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        placeholder="Search by TxID, Function, Endorsers, Status..."
                        className="w-full pl-10 pr-20"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        {filteredLogs.length} results
                      </span>
                    </div>

                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        className="flex items-center px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 cursor-pointer"
                        onClick={() => exportAuditLogsCSV(filteredLogs)}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Export CSV
                      </button>
                      <button
                        className="flex items-center px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 cursor-pointer"
                        onClick={() => printAuditTable("audit-table", `Audit Trail - ${selectedElection}`)}
                      >
                        <Printer className="h-4 w-4 mr-2" />
                        Print
                      </button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="overflow-x-auto">
                    <table id="audit-table" className="mx-auto w-full text-center">
                      <thead>
                        <tr className="border-b text-gray-600">
                          <th className="text-center py-2">Transaction ID</th>
                          <th className="text-center py-2">Action</th>
                          <th className="text-center py-2">Voter ID</th>
                          <th className="text-center py-2">Validation</th>
                          <th className="text-center py-2">Time Stamp</th>
                        </tr>
                      </thead>

                      <tbody>
                        {auditLogs.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="text-center py-12 text-gray-500">
                              No audit logs yet.
                            </td>
                          </tr>
                        ) : filteredLogs.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="text-center py-12 text-gray-500">
                              No matching audit logs found.
                            </td>
                          </tr>
                        ) : (
                          filteredLogs.map((log) => (
                            <tr
                              key={log.id}
                              className="border-b hover:bg-gray-50 cursor-pointer"
                              onClick={() => setSelectedLog(log)}
                            >
                              <td className="py-2 font-mono">
                                {log.txId ? `${log.txId.slice(0, 10)}...` : "-"}
                              </td>
                              <td className="py-2">{log.details?.function ?? log.action}</td>
                              <td className="py-2">{log.voterId ?? "-"}</td>
                              <td className="py-2">
                                <Badge variant="default">
                                  {log.details?.validation ?? "VALID"}
                                </Badge>
                              </td>
                              <td className="py-2">{new Date(log.createdAt).toLocaleString()}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

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
            </div>
          )}
        </main>
      </div>
    </div>
  );
}