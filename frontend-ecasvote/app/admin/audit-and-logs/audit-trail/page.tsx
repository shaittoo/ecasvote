"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Download, Printer } from "lucide-react";
import StatCard from "../../components/statcard";
import { AdminSidebar } from "@/components/sidebars/Sidebar";
import AdminHeader from "../../components/header";

interface AuditLog {
  txId: string;
  block: number;
  fn: string;
  endorsers: string;
  status: "Valid" | "Invalid";
  time: string;
  position: string;
}

export default function AuditTrailViewer() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [selectedElection, setSelectedElection] = useState("CAS SC Elections 2026");

  const stats = {
    totalTransactions: 0,
    totalBlocks: 0,
  };

  useEffect(() => {
    setTimeout(() => {
      setLoading(false);
    }, 800);
  }, []);

  const handleLogout = () => {
    router.push("/login");
  };

  const filteredLogs = auditLogs.filter((log) =>
    `${log.txId} ${log.fn} ${log.endorsers} ${log.status} ${log.position}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const handleExportCSV = () => alert("Exporting audit trail as CSV...");
  const handleExportPDF = () => alert("Exporting audit trail as PDF...");

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

        {/* Main */}
        <main className={`flex-1 p-6 overflow-y-auto transition-all duration-300 ${
          sidebarOpen ? "ml-64" : "ml-20"
        }`}>
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
                        onClick={handleExportCSV}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Export CSV
                      </button>
                      <button
                        className="flex items-center px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 cursor-pointer"
                        onClick={handleExportPDF}
                      >
                        <Printer className="h-4 w-4 mr-2" />
                        Print
                      </button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b text-gray-600">
                          <th className="text-left py-2">Transaction ID</th>
                          <th className="text-left py-2">Block #</th>
                          <th className="text-left py-2">Function</th>
                          <th className="text-left py-2">Endorsements</th>
                          <th className="text-left py-2">Validation</th>
                          <th className="text-left py-2">Time Stamp</th>
                          <th className="text-left py-2">Position</th>
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
                          filteredLogs.map((log, idx) => (
                            <tr key={idx} className="border-b hover:bg-gray-50">
                              <td className="py-2 font-mono">{log.txId}</td>
                              <td className="py-2">{log.block}</td>
                              <td className="py-2">{log.fn}</td>
                              <td className="py-2">{log.endorsers}</td>
                              <td className="py-2">
                                <Badge variant="default">{log.status}</Badge>
                              </td>
                              <td className="py-2">{log.time}</td>
                              <td className="py-2">{log.position}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {filteredLogs.length > 0 && (
                    <div className="flex justify-center mt-4 text-sm text-gray-600">
                      Prev 10 · 1 · 2 · 3 · Next 10 →
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