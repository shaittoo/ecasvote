"use client";

import { useEffect, useState } from "react";
import Sidebar from "../components/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchAuditLogs } from "@/lib/ecasvoteApi";
import type { AuditLog } from "@/lib/ecasvoteApi";

const ELECTION_ID = "election-2025";

export default function ValidatorAuditLogsPage() {
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

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />

      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-5">
          <h1 className="text-2xl font-semibold text-gray-900">
            Audit Logs
            <p className="text-sm text-gray-500">
                Complete transaction history and system activities
            </p>
          </h1>
        </header>

        {/* Main */}
        <main className="p-6">
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