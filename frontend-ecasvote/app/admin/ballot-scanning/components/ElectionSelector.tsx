"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AdminSidebar } from "@/components/Sidebar";
import AdminHeader from "@/app/admin/components/header";
import { fetchElections } from "@/lib/ecasvoteApi";
import type { Election } from "@/lib/ecasvoteApi";

export function ElectionSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [elections, setElections] = useState<Election[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    fetchElections()
      .then((list) => {
        const active = list.filter(
          (e) => e.status === "OPEN" || e.status === "CLOSED"
        );
        setElections(active.length > 0 ? active : list);
        if (active.length === 1) setSelectedId(active[0].id);
        else if (list.length === 1) setSelectedId(list[0].id);
      })
      .catch(() => setElections([]))
      .finally(() => setLoading(false));
  }, []);

  const selected = elections.find((e) => e.id === selectedId);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((p) => !p)}
        active="ballot"
        userName=""
        onLogout={() => router.push("/login")}
        fixed
        pathname={pathname}
      />
      <div className="flex-1">
        <AdminHeader
          title="Ballot Scanning"
          subtitle="Select an election to begin scanning paper ballots"
          sidebarOpen={sidebarOpen}
        />
        <main
          className={`p-6 transition-all duration-300 ${
            sidebarOpen ? "ml-64" : "ml-20"
          }`}
        >
          {loading ? (
            <div className="py-16 text-center text-gray-500">
              Loading elections…
            </div>
          ) : elections.length === 0 ? (
            <div className="py-16 text-center text-gray-500">
              <p className="text-lg font-medium">No elections found</p>
              <p className="mt-1 text-sm">
                Create an election first before scanning ballots.
              </p>
            </div>
          ) : (
            <div className="mx-auto max-w-xl pt-8">
              <Card className="border-[#7A0019]/20 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Choose an election</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div>
                    <label
                      htmlFor="election-select"
                      className="mb-1.5 block text-sm font-medium text-gray-700"
                    >
                      Election
                    </label>
                    <select
                      id="election-select"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#7A0019]/30 cursor-pointer"
                      value={selectedId}
                      onChange={(e) => setSelectedId(e.target.value)}
                    >
                      <option value="">— Select —</option>
                      {elections.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name || e.id}{" "}
                          {e.status === "OPEN"
                            ? "(Active)"
                            : e.status === "CLOSED"
                            ? "(Closed)"
                            : `(${e.status})`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selected && (
                    <div className="rounded-md bg-gray-50 p-3 text-sm text-gray-600 space-y-1">
                      <p>
                        <span className="font-medium text-gray-800">
                          {selected.name}
                        </span>
                      </p>
                      {selected.description && <p>{selected.description}</p>}
                      <p className="text-xs text-gray-400">
                        Status:{" "}
                        <span
                          className={
                            selected.status === "OPEN"
                              ? "text-emerald-600 font-medium"
                              : "text-gray-500"
                          }
                        >
                          {selected.status}
                        </span>
                      </p>
                    </div>
                  )}

                  <Button
                    className="w-full bg-[#7A0019] hover:bg-[#5c0013] text-white cursor-pointer"
                    disabled={!selectedId}
                    onClick={() =>
                      router.push(
                        `/admin/ballot-scanning/${encodeURIComponent(selectedId)}`
                      )
                    }
                  >
                    Continue to Scanning
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}