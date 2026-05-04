"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Download, Printer } from "lucide-react";
import StatCard from "../../components/statcard";
import { AdminSidebar } from "@/components/Sidebar";
import AdminHeader from "../../components/header";
import { fetchAllAuditLogs, fetchElections } from "@/lib/ecasvoteApi";
import type { AuditLog, Election } from "@/lib/ecasvoteApi";
import { exportAuditLogsCSV } from "./export";

const ALL_ELECTIONS = "__all__";

export default function AuditTrailViewer() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Election filter
  const [elections, setElections] = useState<Election[]>([]);
  const [electionsLoading, setElectionsLoading] = useState(true);
  const [filterElectionId, setFilterElectionId] = useState<string>(ALL_ELECTIONS);

  // Fetch all logs on mount
  useEffect(() => {
    const loadLogs = async () => {
      try {
        const res = await fetchAllAuditLogs();
        if (res.ok) setAuditLogs(res.logs);
      } catch (err) {
        console.error("Failed to load audit logs", err);
      } finally {
        setLoading(false);
      }
    };
    loadLogs();
  }, []);

  // Fetch elections on mount (for the filter dropdown)
  useEffect(() => {
    setElectionsLoading(true);
    fetchElections()
      .then((list) => setElections(list))
      .catch((err) => {
        console.error("Failed to load elections", err);
        setElections([]);
      })
      .finally(() => setElectionsLoading(false));
  }, []);

  const handleLogout = () => router.push("/login");

  // Filter logs by election first, then by search query
  const electionFilteredLogs = useMemo(() => {
    if (filterElectionId === ALL_ELECTIONS) return auditLogs;
    return auditLogs.filter((log) => log.electionId === filterElectionId);
  }, [auditLogs, filterElectionId]);

  const filteredLogs = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return electionFilteredLogs;
    return electionFilteredLogs.filter((log) => {
      const dateStr = new Date(log.createdAt).toLocaleString();
      return `${log.txId} ${log.action} ${log.electionId} ${log.details?.selections?.map((s) => `${s.positionId}-${s.candidateId}`).join(", ")} ${log.details?.function} ${dateStr}`
        .toLowerCase()
        .includes(q);
    });
  }, [electionFilteredLogs, search]);

  // Stats reflect the current election filter
  const stats = useMemo(
    () => ({
      totalTransactions: electionFilteredLogs.length,
      totalElections:
        filterElectionId === ALL_ELECTIONS
          ? new Set(auditLogs.map((l) => l.electionId).filter(Boolean)).size
          : 1,
    }),
    [auditLogs, electionFilteredLogs, filterElectionId]
  );

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / rowsPerPage));
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  // Reset pagination whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterElectionId]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  // Windowed pagination helper (same pattern as voter roster page)
  function getPageWindow(current: number, total: number): (number | "ellipsis")[] {
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const window: (number | "ellipsis")[] = [1];
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    if (start > 2) window.push("ellipsis");
    for (let i = start; i <= end; i++) window.push(i);
    if (end < total - 1) window.push("ellipsis");
    window.push(total);
    return window;
  }

  // Helper for the print/export title to reflect what's currently filtered
  const exportTitle = useMemo(() => {
    if (filterElectionId === ALL_ELECTIONS) return "Audit Trail - All Elections";
    const e = elections.find((x) => x.id === filterElectionId);
    return `Audit Trail - ${e?.name || filterElectionId}`;
  }, [filterElectionId, elections]);

  // Print via hidden iframe — bypasses pop-up blockers and works reliably.
  // We skip the broken ./export `printAuditTable` entirely.
  const handlePrint = () => {
    if (filteredLogs.length === 0) return;

    const rows = filteredLogs
      .map(
        (log) => `
        <tr>
          <td style="font-family:monospace">${log.txId ? `${log.txId.slice(0, 10)}…` : "-"}</td>
          <td>${log.electionId ?? "-"}</td>
          <td>${log.details?.function ?? log.action ?? "-"}</td>
          <td>${log.details?.validation ?? "VALID"}</td>
          <td>${new Date(log.createdAt).toLocaleString()}</td>
        </tr>`
      )
      .join("");

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${exportTitle}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; color: #111; }
            h1 { font-size: 18px; margin-bottom: 4px; }
            .meta { font-size: 12px; color: #666; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background: #f3f4f6; font-weight: 600; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <h1>${exportTitle}</h1>
          <div class="meta">${filteredLogs.length} entries · Generated ${new Date().toLocaleString()}</div>
          <table>
            <thead>
              <tr>
                <th>Transaction ID</th>
                <th>Election</th>
                <th>Action</th>
                <th>Validation</th>
                <th>Time Stamp</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>
    `;

    // Create a hidden iframe, write the HTML, then trigger print on its window.
    // This avoids window.open() entirely, so pop-up blockers don't apply.
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      console.error("Print failed: could not access iframe document.");
      document.body.removeChild(iframe);
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    // Wait for the iframe content to render before printing.
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.error("Print failed:", err);
      }
      // Clean up after the print dialog closes (user clicks Print or Cancel).
      setTimeout(() => {
        if (iframe.parentNode) document.body.removeChild(iframe);
      }, 1000);
    };
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AdminSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        active="audit"
        userName="Admin"
        onLogout={handleLogout}
        fixed
        pathname={pathname}
      />

      <div className="flex-1 flex flex-col">
        <AdminHeader 
        title="Audit Trail Viewer" 
        subtitle="Every system action, recorded and verifiable"
        sidebarOpen={sidebarOpen} />

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
                  title={
                    filterElectionId === ALL_ELECTIONS
                      ? "Total Audit Entries"
                      : "Audit Entries (Filtered)"
                  }
                  value={stats.totalTransactions}
                  color="text-gray-700"
                />
                <StatCard
                  title={
                    filterElectionId === ALL_ELECTIONS
                      ? "Total Elections"
                      : "Selected Election"
                  }
                  value={stats.totalElections}
                  color="text-gray-700"
                />
              </div>

              {/* Search + Filter + Export + Table Card */}
              <Card>
                <CardHeader className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 lg:flex-nowrap w-full">
                    {/* Search */}
                    <div className="relative min-h-10 min-w-0 flex-1 basis-[min(100%,20rem)] sm:min-w-[12rem]">
                      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search by TxID, Function, Status..."
                        className="h-10 w-full pl-9 pr-[5.5rem]"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground tabular-nums">
                        {filteredLogs.length} results
                      </span>
                    </div>

                    {/* Election filter dropdown */}
                    <label htmlFor="audit-filter-election" className="sr-only">
                      Filter by election
                    </label>
                    <select
                      id="audit-filter-election"
                      className="h-10 w-full min-w-0 shrink-0 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-[min(100%,16rem)] sm:max-w-xs"
                      value={filterElectionId}
                      disabled={electionsLoading}
                      onChange={(e) => setFilterElectionId(e.target.value)}
                    >
                      <option value={ALL_ELECTIONS}>All Elections</option>
                      {elections.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name || e.id}
                        </option>
                      ))}
                    </select>

                    {/* Export buttons */}
                    <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 gap-2 bg-[#7A0019] hover:bg-[#5c0013] text-white cursor-pointer"
                        onClick={() => exportAuditLogsCSV(filteredLogs)}
                        disabled={filteredLogs.length === 0}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Export CSV
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 gap-2 bg-[#7A0019] hover:bg-[#5c0013] text-white cursor-pointer"
                        onClick={handlePrint}
                        disabled={filteredLogs.length === 0}
                      >
                        <Printer className="mr-2 h-4 w-4" />
                        Print
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="overflow-x-auto">
                    <table id="audit-table" className="mx-auto w-full text-center">
                      <thead>
                        <tr className="border-b text-gray-600">
                          <th className="text-center py-2">Transaction ID</th>
                          <th className="text-center py-2">Election</th>
                          <th className="text-center py-2">Action</th>
                          <th className="text-center py-2">Validation</th>
                          <th className="text-center py-2">Time Stamp</th>
                        </tr>
                      </thead>

                      <tbody>
                        {auditLogs.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center py-12 text-gray-500">
                              No audit logs yet.
                            </td>
                          </tr>
                        ) : filteredLogs.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center py-12 text-gray-500">
                              {filterElectionId !== ALL_ELECTIONS && !search
                                ? "No audit logs for the selected election."
                                : "No matching audit logs found."}
                            </td>
                          </tr>
                        ) : (
                          paginatedLogs.map((log) => (
                            <tr
                              key={log.id}
                              className="border-b hover:bg-gray-50 cursor-pointer"
                              onClick={() => setSelectedLog(log)}
                            >
                              <td className="py-2 font-mono">
                                {log.txId ? `${log.txId.slice(0, 10)}...` : "-"}
                              </td>
                              <td className="py-2 text-xs">{log.electionId ?? "-"}</td>
                              <td className="py-2">{log.details?.function ?? log.action}</td>
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

                      {getPageWindow(currentPage, totalPages).map((p, i) =>
                        p === "ellipsis" ? (
                          <span
                            key={`ellipsis-${i}`}
                            className="px-2 py-1 text-gray-400 select-none"
                          >
                            …
                          </span>
                        ) : (
                          <button
                            key={p}
                            className={`px-2 py-1 border rounded ${currentPage === p ? "bg-gray-200" : ""}`}
                            onClick={() => setCurrentPage(p)}
                          >
                            {p}
                          </button>
                        )
                      )}

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