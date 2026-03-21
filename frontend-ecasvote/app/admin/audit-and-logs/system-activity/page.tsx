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
import { fetchSystemActivity, SystemActivity } from "@/lib/ecasvoteApi";
import { exportSystemActCSV, printSysActTable } from "./export";

export default function SystemActivityViewer() {
  const router = useRouter();
  const pathname = usePathname();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [logs, setLogs] = useState<SystemActivity[]>([]);

  // Fetch logs
  useEffect(() => {
    const loadLogs = async () => {
      try {
        setLoading(true);
        const res = await fetchSystemActivity();

        if (res.ok) {
          setLogs(res.logs);
        }
      } catch (err) {
        console.error("Failed to load system activity logs", err);
      } finally {
        setLoading(false);
      }
    };

    loadLogs();
  }, []);

  const handleLogout = () => router.push("/login");

  // ✅ Categorize logs
  const stats = {
    adminActions: logs.filter((l) => l.action === "ADMIN_ACTION").length,
    loginFailures: logs.filter((l) => l.action === "LOGIN_FAILED").length,
    rosterUpdates: logs.filter((l) => l.action === "ROSTER_UPDATE").length,
    electionConfigChanges: logs.filter((l) => l.action === "ELECTION_CONFIG_UPDATE").length,
    systemErrors: logs.filter((l) => l.status.toLowerCase() !== "success").length,
  };

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    const dateStr = new Date(log.timestamp).toLocaleString();

    return `${log.user} ${log.role} ${log.action} ${log.description} ${log.ipAddress} ${log.status} ${dateStr}`
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
        active="system-activity"
        userName="John"
        onLogout={handleLogout}
        fixed
        pathname={pathname}
      />

      <div className="flex-1 flex flex-col">
        <AdminHeader title="System Activity Logs" sidebarOpen={sidebarOpen} />

        <main
          className={`flex-1 p-6 overflow-y-auto transition-all duration-300 ${
            sidebarOpen ? "ml-64" : "ml-20"
          }`}
        >
          {loading ? (
            <div className="text-center py-12 text-gray-500">
              Loading system activity...
            </div>
          ) : (
            <div className="max-w-7xl mx-auto space-y-6">

              {/* ✅ Stats Cards (CORRECTED) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <StatCard title="Admin Actions" value={stats.adminActions} />
                <StatCard title="Login Failures" value={stats.loginFailures} />
                <StatCard title="Roster Updates" value={stats.rosterUpdates} />
                <StatCard title="Election Config Changes" value={stats.electionConfigChanges} />
                <StatCard title="System Errors" value={stats.systemErrors} color="text-red-600" />
              </div>

              {/* Table Card */}
              <Card>
                <CardHeader className="space-y-4">
                  <div className="flex items-center justify-between gap-4 w-full">

                    {/* Search */}
                    <div className="relative flex-1 max-w-6xl">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        placeholder="Search logs..."
                        className="w-full pl-10 pr-20"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        {filteredLogs.length} results
                      </span>
                    </div>

                    {/* Export Buttons */}
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        className="flex items-center px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 cursor-pointer"
                        onClick={() => exportSystemActCSV(filteredLogs)}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Export CSV
                      </button>
            
                      <button
                        className="flex items-center px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 cursor-pointer"
                        onClick={() =>
                          printSysActTable("system-table", "System Activity Logs")
                        }
                      >
                        <Printer className="h-4 w-4 mr-2" />
                        Print
                      </button>
                    </div>

                  </div>
                </CardHeader>

                <CardContent>
                  <div className="overflow-x-auto">
                    <table id="system-table" className="mx-auto w-full text-center">
                      <thead>
                        <tr className="border-b text-gray-600">
                          <th className="py-2">User</th>
                          <th className="py-2">Role</th>
                          <th className="py-2">Action</th>
                          <th className="py-2">Description</th>
                          <th className="py-2">IP Address</th>
                          <th className="py-2">Status</th>
                          <th className="py-2">Timestamp</th>
                        </tr>
                      </thead>

                      <tbody>
                        {logs.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="text-center py-12 text-gray-500">
                              No system activity logs yet.
                            </td>
                          </tr>
                        ) : filteredLogs.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="text-center py-12 text-gray-500">
                              No matching logs found.
                            </td>
                          </tr>
                        ) : (
                          filteredLogs.map((log) => (
                            <tr key={log.id} className="border-b hover:bg-gray-50">
                              <td className="py-2">{log.user || "System"}</td>
                              <td className="py-2">{log.role || "-"}</td>
                              <td className="py-2">{log.action}</td>
                              <td className="py-2">{log.description}</td>
                              <td className="py-2">{log.ipAddress || "-"}</td>
                              <td className="py-2">
                                <Badge
                                  variant={
                                    log.status.toLowerCase() === "success"
                                      ? "default"
                                      : "destructive"
                                  }
                                >
                                  {log.status}
                                </Badge>
                              </td>
                              <td className="py-2">
                                {new Date(log.timestamp).toLocaleString()}
                              </td>
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
                </CardContent>
              </Card>

            </div>
          )}
        </main>
      </div>
    </div>
  );
}