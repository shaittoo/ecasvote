"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Download, Printer } from "lucide-react";
import {
  fetchAuditLogs,
  fetchAllAuditLogs,
  fetchElections,
} from "@/lib/ecasvoteApi";
import type { AuditLog, Election } from "@/lib/ecasvoteApi";
import { ValidatorSidebar } from "@/components/Sidebar";
import ValidatorHeader from "../components/header";
import { exportAuditLogsCSV } from "../../admin/audit-and-logs/audit-trail/export";

const ALL_ELECTIONS = "__all__";

export default function ValidatorAuditLogsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [elections, setElections] = useState<Election[]>([]);
  const [electionId, setElectionId] = useState<string>(ALL_ELECTIONS);
  const [electionsLoading, setElectionsLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const electionNameById = useMemo(() => {
    const map = new Map<string, string>();
    elections.forEach((e) => map.set(e.id, e.name || e.id));
    return map;
  }, [elections]);

  useEffect(() => {
    setElectionsLoading(true);
    fetchElections()
      .then((list) => {
        setElections(list);
        setElectionId(ALL_ELECTIONS);
      })
      .catch(() => setElections([]))
      .finally(() => setElectionsLoading(false));
  }, []);

  useEffect(() => {
    if (electionsLoading) return;
    setLoading(true);

    const promise =
      electionId === ALL_ELECTIONS
        ? fetchAllAuditLogs().then((res) => ({ logs: res.logs ?? [] }))
        : fetchAuditLogs(electionId);

    promise
      .then((response) => setAuditLogs(response.logs || []))
      .catch(() => setAuditLogs([]))
      .finally(() => setLoading(false));
  }, [electionId, electionsLoading]);

  const handleLogout = () => {
    router.push("/login");
  };

  const filteredLogs = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return auditLogs;
    return auditLogs.filter((log) => {
      const timestamp = new Date(log.createdAt).toLocaleString("en-US", {
        timeZone: "Asia/Manila",
      });
      const electionLabel =
        electionNameById.get(log.electionId ?? "") ?? log.electionId ?? "";
      return (
        (log.txId ?? "").toLowerCase().includes(q) ||
        (log.action ?? "").toLowerCase().includes(q) ||
        electionLabel.toLowerCase().includes(q) ||
        timestamp.toLowerCase().includes(q) ||
        JSON.stringify(log.details ?? {}).toLowerCase().includes(q)
      );
    });
  }, [auditLogs, search, electionNameById]);

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / rowsPerPage));
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, electionId]);

  const exportTitle = useMemo(() => {
    if (electionId === ALL_ELECTIONS) return "Audit Logs - All Elections";
    return `Audit Logs - ${electionNameById.get(electionId) ?? electionId}`;
  }, [electionId, electionNameById]);

  const handlePrint = () => {
    if (filteredLogs.length === 0) return;

    const rows = filteredLogs
      .map((log) => {
        const electionLabel =
          (log.electionId && electionNameById.get(log.electionId)) ||
          log.electionId ||
          "-";
        return `
          <tr>
            <td>${new Date(log.createdAt).toLocaleString("en-US", { timeZone: "Asia/Manila" })}</td>
            <td>${electionLabel}</td>
            <td>${log.action ?? "-"}</td>
            <td>${log.details?.validation ?? "VALID"}</td>
            <td style="font-family:monospace">${log.txId ? `${log.txId.slice(0, 10)}…` : "-"}</td>
          </tr>`;
      })
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
                <th>Timestamp</th>
                <th>Election</th>
                <th>Action</th>
                <th>Validation</th>
                <th>Transaction ID</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>
    `;

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

    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.error("Print failed:", err);
      }
      setTimeout(() => {
        if (iframe.parentNode) document.body.removeChild(iframe);
      }, 1000);
    };
  };

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

        <main
          className={`flex-1 p-6 overflow-y-auto transition-all duration-300 ${
            sidebarOpen ? "ml-64" : "ml-20"
          }`}
        >
          <div className="w-full max-w-7xl mx-auto space-y-6">
            {/* Toolbar */}
            <Card>
              <CardHeader className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 lg:flex-nowrap">
                  {/* Search */}
                  <div className="relative min-h-10 min-w-0 flex-1 basis-[min(100%,20rem)] sm:min-w-[12rem]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search by TxID, Action, Election, Timestamp..."
                      className="h-10 w-full pl-9 pr-[5.5rem]"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground tabular-nums">
                      {filteredLogs.length} results
                    </span>
                  </div>

                  {/* Election dropdown */}
                  <div className="min-w-0 flex-1 basis-[min(100%,5rem)] sm:min-w-[10rem]">
                    <label htmlFor="validator-audit-election" className="sr-only">
                      Election
                    </label>
                    <select
                      id="validator-audit-election"
                      className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={electionId}
                      disabled={electionsLoading}
                      onChange={(e) => setElectionId(e.target.value)}
                    >
                      <option value={ALL_ELECTIONS}>All Elections</option>
                      {elections.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name || e.id}
                        </option>
                      ))}
                    </select>
                  </div>

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
            </Card>

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
                          <th className="text-left py-3 px-4 font-semibold text-gray-900">Election</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-900">Action</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-900">Validation</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-900">Transaction ID</th>
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
                          paginatedLogs.map((log) => {
                            const electionLabel =
                              (log.electionId && electionNameById.get(log.electionId)) ||
                              log.electionId ||
                              "-";
                            return (
                              <tr
                                key={log.id}
                                className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                                onClick={() => setSelectedLog(log)}
                              >
                                <td className="py-3 px-4 text-sm">
                                  {new Date(log.createdAt).toLocaleString("en-US", {
                                    timeZone: "Asia/Manila",
                                  })}
                                </td>
                                <td className="py-3 px-4 text-sm">{electionLabel}</td>
                                <td className="py-3 px-4">
                                  <Badge variant="outline">{log.action}</Badge>
                                </td>
                                <td className="py-3 px-4">
                                  <Badge variant="outline">
                                    {log.details?.validation ?? "VALID"}
                                  </Badge>
                                </td>
                                <td className="py-3 px-4 text-sm font-mono text-gray-600">
                                  {log.txId ? `${log.txId.substring(0, 10)}...` : "N/A"}
                                </td>
                              </tr>
                            );
                          })
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
                        <p>
                          <strong>Action:</strong> {selectedLog.action}
                        </p>
                        <p>
                          <strong>Election:</strong>{" "}
                          {(selectedLog.electionId &&
                            electionNameById.get(selectedLog.electionId)) ||
                            selectedLog.electionId ||
                            "-"}
                        </p>
                        <p>
                          <strong>TxID:</strong>{" "}
                          <span className="font-mono break-all">
                            {selectedLog.txId || "-"}
                          </span>
                        </p>
                        <p>
                          <strong>Validation:</strong>{" "}
                          {selectedLog.details?.validation ?? "-"}
                        </p>
                        <p>
                          <strong>Time:</strong>{" "}
                          {new Date(selectedLog.createdAt).toLocaleString("en-US", {
                            timeZone: "Asia/Manila",
                          })}
                        </p>
                        <p className="mt-3">
                          <strong>Full Details:</strong>
                        </p>
                        <pre className="mt-1 rounded-md bg-gray-100 p-3 text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-all">
                          {selectedLog.details
                            ? JSON.stringify(selectedLog.details, null, 2)
                            : "No details"}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}