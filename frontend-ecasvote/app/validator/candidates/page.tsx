"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchPositions } from "@/lib/ecasvoteApi";
import type { Position } from "@/lib/ecasvoteApi";
import { ValidatorSidebar } from "@/components/Sidebar";
import ValidatorHeader from "../components/header";

const ELECTION_ID = "election-2025";

export default function ValidatorCandidatesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPositions() {
      try {
        const data = await fetchPositions(ELECTION_ID);
        setPositions(data || []);
      } catch (error) {
        console.error("Failed to load positions:", error);
        setPositions([]);
      } finally {
        setLoading(false);
      }
    }

    loadPositions();
  }, []);

  const handleLogout = () => {
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <ValidatorSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        active="candidates"
        userName="Validator"
        onLogout={handleLogout}
        fixed
        pathname={pathname}
      />

      <div className="flex-1 flex flex-col">
        <ValidatorHeader title="Candidates" sidebarOpen={sidebarOpen} />

        {/* Main Content */}
        <main className={`flex-1 p-6 space-y-6 overflow-y-auto transition-all duration-300 ${
          sidebarOpen ? "ml-64" : "ml-20"
        }`}>
          {loading ? (
            <div className="text-center py-12 text-gray-500">
              Loading candidates...
            </div>
          ) : positions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No positions found
            </div>
          ) : (
            positions.map((position) => (
              <Card key={position.id}>
                <CardHeader>
                  <CardTitle>{position.name}</CardTitle>
                </CardHeader>

                <CardContent>
                  {position.candidates &&
                  position.candidates.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {position.candidates.map((candidate) => (
                        <div
                          key={candidate.id}
                          className="border rounded-lg p-4 hover:shadow-md transition-shadow bg-white"
                        >
                          <p className="font-medium text-gray-900">
                            {candidate.name}
                          </p>

                          {candidate.party && (
                            <p className="text-sm text-gray-600 mt-1">
                              Party: {candidate.party}
                            </p>
                          )}

                          {candidate.program && (
                            <p className="text-sm text-gray-600">
                              Program: {candidate.program}
                            </p>
                          )}

                          {candidate.yearLevel && (
                            <p className="text-sm text-gray-600">
                              Year Level: {candidate.yearLevel}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">
                      No candidates registered for this position.
                    </p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </main>
      </div>
    </div>
  );
}