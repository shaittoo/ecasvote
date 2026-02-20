"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchAuditLogs } from "@/lib/ecasvoteApi";
import type { AuditLog } from "@/lib/ecasvoteApi";
import { ValidatorSidebar } from "@/components/Sidebar";
import ValidatorHeader from "../components/header";

const ELECTION_ID = "election-2025";

export default function ValidatorAuditLogsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

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

        {/* Main */}
        <main className={`flex-1 p-6 overflow-y-auto transition-all duration-300 ${
          sidebarOpen ? "ml-64" : "ml-20"
        }`}>
          <Card>
            <CardContent>
              {loading ? (
                <div className="py-12 text-center text-gray-500">
                  Loading audit logs...
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">
                          Timestamp
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">
                          Action
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">
                          Voter ID
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">
                          Transaction ID
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">
                          Details
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {auditLogs.map((log) => (
                        <tr
                          key={log.id}
                          className="border-b border-gray-100 hover:bg-gray-50"
                        >
                          <td className="py-3 px-4 text-sm">
                            {new Date(log.createdAt).toLocaleString(
                              "en-US",
                              { timeZone: "Asia/Manila" }
                            )}
                          </td>

                          <td className="py-3 px-4">
                            <Badge variant="outline">
                              {log.action}
                            </Badge>
                          </td>

                          <td className="py-3 px-4 text-sm text-gray-600">
                            {log.voterId || "N/A"}
                          </td>

                          <td className="py-3 px-4 text-sm font-mono text-gray-600">
                            {log.txId ? (
                              <span className="text-xs">
                                {log.txId.substring(0, 20)}...
                              </span>
                            ) : (
                              "N/A"
                            )}
                          </td>

                          <td className="py-3 px-4 text-sm text-gray-600">
                            {log.details
                              ? JSON.stringify(log.details).substring(0, 50) + "..."
                              : "N/A"}
                          </td>
                        </tr>
                      ))}

                      {auditLogs.length === 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="py-12 text-center text-gray-500"
                          >
                            No audit logs found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}