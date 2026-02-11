"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchPositions } from "@/lib/ecasvoteApi";
import type { Position } from "@/lib/ecasvoteApi";
import Sidebar from "../components/sidebar";

const ELECTION_ID = "election-2025";

export default function ValidatorCandidatesPage() {
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

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />

      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-5">
          <h1 className="text-2xl font-semibold text-gray-900">
            Candidates
          </h1>
        </header>

        {/* Main Content */}
        <main className="p-6 space-y-6">
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