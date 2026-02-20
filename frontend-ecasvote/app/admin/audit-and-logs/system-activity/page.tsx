"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Download, Printer } from "lucide-react";
import StatCard from "../../components/statcard";
import { AdminSidebar } from "@/components/sidebars/Sidebar";
import AdminHeader from "../../components/header";

interface SystemLog {
  timestamp: string;
  user: string;
  role: string;
  action: string;
  description: string;
  ip: string;
  status: "Success" | "Failed";
}

export default function SystemActivityLogs() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [selectedElection, setSelectedElection] = useState("CAS SC Elections 2026");

  const stats = {
    adminActions: 0,
    loginFailures: 0,
    rosterUpdates: 0,
    electionConfigChanges: 0,
    systemErrors: 0,
  };

  useEffect(() => {
    setTimeout(() => {
      setLoading(false);
    }, 800);
  }, []);

  const handleLogout = () => {
    router.push("/login");
  };

  const filteredLogs = logs.filter((log) =>
    `${log.timestamp} ${log.user} ${log.role} ${log.action} ${log.description} ${log.ip} ${log.status}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const handleExportCSV = () => alert("Exporting system logs as CSV...");
  const handleExportPDF = () => alert("Exporting system logs as PDF...");

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
        <AdminHeader title="System Activity Logs" sidebarOpen={sidebarOpen} />

        {/* Main */}
        <main className={`flex-1 p-6 overflow-y-auto transition-all duration-300 ${
          sidebarOpen ? "ml-64" : "ml-20"
        }`}>
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading system logs...</div>
          ) : (
            <div className="max-w-7xl mx-auto space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <StatCard title="Admin Actions" value={stats.adminActions} color="text-gray-700" />
                <StatCard title="Login Failures" value={stats.loginFailures} color="text-yellow-700" />
                <StatCard title="Roster Updates" value={stats.rosterUpdates} color="text-green-700" />
                <StatCard
                  title="Election Config Changes"
                  value={stats.electionConfigChanges}
                  color="text-blue-700"
                />
                <StatCard title="System Errors/Warnings" value={stats.systemErrors} color="text-red-700" />
              </div>

              {/* Search + Export + Table */}
              <Card>
                <CardHeader className="space-y-4">
                  <div className="flex items-center justify-between gap-4 w-full">
                    <div className="relative flex-1 max-w-6xl">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        placeholder="Search by User, Role, Action Performed, ..."
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
                          <th className="text-left py-2">Timestamp</th>
                          <th className="text-left py-2">User</th>
                          <th className="text-left py-2">Role</th>
                          <th className="text-left py-2">Action Performed</th>
                          <th className="text-left py-2">Description</th>
                          <th className="text-left py-2">IP Address</th>
                          <th className="text-left py-2">Status</th>
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
                          filteredLogs.map((log, idx) => (
                            <tr key={idx} className="border-b hover:bg-gray-50">
                              <td className="py-2">{log.timestamp}</td>
                              <td className="py-2">{log.user}</td>
                              <td className="py-2">{log.role}</td>
                              <td className="py-2">{log.action}</td>
                              <td className="py-2">{log.description}</td>
                              <td className="py-2">{log.ip}</td>
                              <td className="py-2">{log.status}</td>
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