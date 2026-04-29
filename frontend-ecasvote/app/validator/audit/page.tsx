"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Download, Printer } from "lucide-react";
import { fetchAuditLogs, fetchElections } from "@/lib/ecasvoteApi";
import type { AuditLog, Election } from "@/lib/ecasvoteApi";
import { ValidatorSidebar } from "@/components/Sidebar";
import ValidatorHeader from "../components/header";
import { exportAuditLogsCSV, printAuditTable } from "../../admin/audit-and-logs/audit-trail/export";

export default function ValidatorAuditLogsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [elections, setElections] = useState<Election[]>([]);
  const [electionId, setElectionId] = useState("");
  const [electionsLoading, setElectionsLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  useEffect(() => {
    setElectionsLoading(true);
    fetchElections()
      .then((list) => {
        setElections(list);
        const open = list.find((e) => e.status === "OPEN");
        const closed = list.find((e) => e.status === "CLOSED");
        setElectionId(open?.id ?? closed?.id ?? list[0]?.id ?? "");
      })
      .catch(() => setElections([]))
      .finally(() => setElectionsLoading(false));
  }, []);

  useEffect(() => {
    if (!electionId || electionsLoading) return;
    setLoading(true);
    fetchAuditLogs(electionId)
      .then((response) => setAuditLogs(response.logs || []))
      .catch(() => setAuditLogs([]))
      .finally(() => setLoading(false));
  }, [electionId, electionsLoading]);

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
          <div className="mb-4">
            <select
              className="h-10 w-full sm:max-w-md rounded-md border border-input bg-background px-3 text-sm shadow-sm cursor-pointer"
              value={electionId}
              disabled={electionsLoading || elections.length === 0}
              onChange={(e) => setElectionId(e.target.value)}
            >
              {electionsLoading ? (
                <option value="">Loading elections...</option>
              ) : elections.length === 0 ? (
                <option value="">No elections found</option>
              ) : (
                elections.map((e) => (
                  <option key={e.id} value={e.id}>{e.name || e.id}</option>
                ))
              )}
            </select>
          </div>
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
                            <td
                              className="py-3 px-4 text-sm text-gray-600 cursor-pointer hover:text-blue-600 hover:underline"
                              title="Click to view full details"
                              onClick={() => setSelectedLog(log)}
                            >
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
                          <p><strong>Action:</strong> {selectedLog.action}</p>
                          <p><strong>Election:</strong> {selectedLog.electionId || "-"}</p>
                          <p><strong>TxID:</strong> <span className="font-mono break-all">{selectedLog.txId || "-"}</span></p>
                          <p><strong>Voter ID:</strong> {selectedLog.voterId || "-"}</p>
                          <p><strong>Time:</strong> {new Date(selectedLog.createdAt).toLocaleString("en-US", { timeZone: "Asia/Manila" })}</p>
                          <p className="mt-3"><strong>Full Details:</strong></p>
                          <pre className="mt-1 rounded-md bg-gray-100 p-3 text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-all">
                            {selectedLog.details ? JSON.stringify(selectedLog.details, null, 2) : "No details"}
                          </pre>
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