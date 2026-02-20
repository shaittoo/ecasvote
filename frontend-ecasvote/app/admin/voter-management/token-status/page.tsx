"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus } from "lucide-react";
import { AdminSidebar } from "@/components/sidebars/Sidebar";

interface Token {
  studentNumber: string;
  tokenValue: string;
  timeCreated: string;
  status: "Used" | "Unused";
  timeUsed?: string;
}

export default function TokenStatusPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [search, setSearch] = useState("");
  const [selectedElection, setSelectedElection] = useState("CAS SC Elections 2026");

  // Mock stats (replace with API later)
  const stats = {
    total: 1200,
    used: 0,
    available: 1200,
    generated: 2000,
  };

  useEffect(() => {
    setTimeout(() => {
      setTokens([]); // empty state
      setLoading(false);
    }, 800);
  }, []);

  const filteredTokens = tokens.filter(t =>
    `${t.studentNumber} ${t.tokenValue}`.toLowerCase().includes(search.toLowerCase())
  );

  const handleLogout = () => {
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AdminSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        active="voter"
        userName="John"
        onLogout={handleLogout}
        fixed
        pathname={pathname}
      />

      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className={`bg-white border-b border-gray-200 px-6 py-5 flex items-center justify-between transition-all duration-300 ${
          sidebarOpen ? "ml-64" : "ml-20"
        }`}>
          <h1 className="text-2xl font-semibold text-gray-900">Token Status</h1>
        </header>

        {/* Main */}
        <main className={`flex-1 p-2 overflow-y-auto transition-all duration-300 ${
          sidebarOpen ? "ml-64" : "ml-20"
        }`}>
          {loading ? (
            <div className="text-center py-12 text-gray-500">
              Loading token status...
            </div>
          ) : (
            <div className="max-w-7xl mx-auto space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="Total Tokens" value={stats.total} color="text-gray-600" />
                <StatCard title="Tokens Used" value={stats.used} color="text-green-700" />
                <StatCard title="Tokens Available" value={stats.available} color="text-red-700" />
                <StatCard title="Tokens Generated" value={stats.generated} color="text-blue-700" />
              </div>

              {/* Table Card */}
              <Card>
                <CardHeader className="space-y-4">
                  {/* Search + Generate */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 max-w-6xl">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <Input
                          placeholder="Search keyword or actions..."
                          className="pl-10 pr-20"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          {filteredTokens.length} results
                        </span>
                      </div>
                    </div>

                    <Button className="bg-red-700 hover:bg-red-800 text-white flex items-center gap-2 cursor-pointer">
                      <Plus className="w-4 h-4" />
                      Generate All Token
                    </Button>
                  </div>
                </CardHeader>

                <CardContent>
                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b text-sm text-gray-600">
                          <th className="text-left py-2">Student Number</th>
                          <th className="text-left py-2">Token Value</th>
                          <th className="text-left py-2">Time Created</th>
                          <th className="text-left py-2">Status</th>
                          <th className="text-left py-2">Time Used</th>
                          <th className="text-left py-2">Action</th>
                        </tr>
                      </thead>

                      <tbody>
                        {filteredTokens.length === 0 ? (
                          <tr>
                            <td
                              colSpan={6}
                              className="text-center py-10 text-gray-500"
                            >
                              No token activity available.
                            </td>
                          </tr>
                        ) : (
                          filteredTokens.map((token, idx) => (
                            <tr key={idx} className="border-b text-sm hover:bg-gray-50">
                              <td className="py-2">{token.studentNumber}</td>
                              <td className="py-2 font-mono">{token.tokenValue}</td>
                              <td className="py-2">{token.timeCreated}</td>
                              <td className="py-2">
                                <span
                                  className={`px-2 py-1 rounded text-xs font-medium ${
                                    token.status === "Used"
                                      ? "bg-green-100 text-green-700"
                                      : "bg-gray-100 text-gray-600"
                                  }`}
                                >
                                  {token.status}
                                </span>
                              </td>
                              <td className="py-2">{token.timeUsed || "—"}</td>
                              <td className="py-2">
                                <Button size="sm" variant="outline">
                                  View
                                </Button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination (only if tokens exist) */}
                  {filteredTokens.length > 0 && (
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

/* --- Small stat card component --- */
function StatCard({
  title,
  value,
  color,
}: {
  title: string;
  value: number;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="py-6 flex flex-col items-center justify-center">
        <div className={`text-4xl font-bold ${color}`}>{value}</div>
        <div className="text-sm text-gray-700 mt-1">{title}</div>
      </CardContent>
    </Card>
  );
}