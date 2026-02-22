"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchPositions } from "@/lib/ecasvoteApi";
import type { Position } from "@/lib/ecasvoteApi";
import { StudentVoterSidebar } from "@/components/Sidebar";
import StudentVoterHeader from "../components/header";

const ELECTION_ID = "election-2025";

export default function StudentVoterCandidatesPage() {
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
      <StudentVoterSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        active="candidates"
        userName="Student Voter"
        onLogout={handleLogout}
        fixed
        pathname={pathname}
      />

      <div className="flex-1 flex flex-col">
        <div className={`transition-all duration-300 ${sidebarOpen ? "ml-64" : "ml-20"}`}>
          <StudentVoterHeader title="Candidates" subtitle="Review all candidates and their information" sidebarOpen={sidebarOpen} />
        </div>

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
                      {position.candidates.map((candidate) => {
                        let bgColor = '#ffffff';
                        let borderColor = '#e5e7eb';
                        if (candidate.party?.toLowerCase() === 'pmb') {
                          bgColor = '#dbeafe';
                          borderColor = '#3b82f6';
                        } else if (candidate.party?.toLowerCase() === 'samasa') {
                          bgColor = '#fee2e2';
                          borderColor = '#b80000';
                        }
                        return (
                        <div
                          key={candidate.id}
                          style={{ backgroundColor: bgColor, border: `1px solid ${borderColor}` }}
                          className="rounded-lg p-4 hover:shadow-md transition-shadow"
                        >
                          <p className="font-medium text-gray-900">
                            {candidate.name}
                          </p>

                          {candidate.party && (
                            <p className="text-sm text-gray-600 mt-1">
                              Party: {['samasa', 'pmb'].includes(candidate.party.toLowerCase()) ? candidate.party.toUpperCase() : candidate.party}
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
                        );
                      })}
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
