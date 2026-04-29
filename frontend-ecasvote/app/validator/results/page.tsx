"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchElection, fetchElections, fetchPositions, fetchResults } from "@/lib/ecasvoteApi";
import type { Election, Position, ResultsJson } from "@/lib/ecasvoteApi";
import { ValidatorSidebar } from "@/components/Sidebar";
import ValidatorHeader from "../components/header";
import { Button } from "@/components/ui/button";

import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export default function ValidatorResultsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [elections, setElections] = useState<Election[]>([]);
  const [electionId, setElectionId] = useState("");
  const [electionsLoading, setElectionsLoading] = useState(true);
  const [election, setElection] = useState<any>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [results, setResults] = useState<ResultsJson | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setElectionsLoading(true);
    fetchElections()
      .then((list) => {
        setElections(list);
        const open = list.find((e) => e.status === "OPEN");
        const closed = list.find((e) => e.status === "CLOSED");
        setElectionId(open?.id ?? closed?.id ?? list[0]?.id ?? "");
      })
      .catch(() => setElections([]))
      .finally(() => setElectionsLoading(false));
  }, []);

  useEffect(() => {
    if (!electionId || electionsLoading) return;
    setLoading(true);
    Promise.all([
      fetchElection(electionId).catch(() => null),
      fetchPositions(electionId).catch(() => []),
      fetchResults(electionId).catch(() => null),
    ])
      .then(([electionData, positionsData, resultsData]) => {
        setElection(electionData);
        setPositions(positionsData || []);
        setResults(resultsData || null);
      })
      .catch(() => {
        setPositions([]);
        setResults(null);
      })
      .finally(() => setLoading(false));
  }, [electionId, electionsLoading]);

  const handleLogout = () => {
    router.push("/login");
  };

  // Convert results into chart format
  const resultsCharts =
    positions.map((position) => {
      const positionResults = results?.[position.id];
      if (!positionResults) return null;

      const labels = position.candidates.map((c) => c.name);
      const dataValues = position.candidates.map(
        (c) => positionResults[c.id] || 0
      );

      return {
        position: position.name,
        data: {
          labels,
          datasets: [
            {
              label: "Votes",
              data: dataValues,
              backgroundColor: "#7A0019",
            },
          ],
        },
      };
    }).filter(Boolean) || [];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <ValidatorSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        active="results"
        userName="Validator"
        onLogout={handleLogout}
        fixed
        pathname={pathname}
      />

      <div className="flex-1 flex flex-col">
        <ValidatorHeader title="Election Results" sidebarOpen={sidebarOpen} />

        {/* Main */}
        <main className={`flex-1 p-6 space-y-6 overflow-y-auto transition-all duration-300 ${
          sidebarOpen ? "ml-64" : "ml-20"
        }`}>
          <select
            className="h-10 w-full sm:max-w-md rounded-md border border-input bg-background px-3 text-sm shadow-sm cursor-pointer"
            value={electionId}
            disabled={electionsLoading || elections.length === 0}
            onChange={(e) => setElectionId(e.target.value)}
          >
            {electionsLoading ? (
              <option value="">Loading elections...</option>
            ) : elections.length === 0 ? (
              <option value="">No elections found</option>
            ) : (
              elections.map((e) => (
                <option key={e.id} value={e.id}>{e.name || e.id}</option>
              ))
            )}
          </select>
          {loading ? (
            <div className="text-center py-12 text-gray-500">
              Loading results...
            </div>
          ) : election && !election.resultsPublished ? (
            <div className="py-12 text-center text-gray-500 space-y-4">
              <p className="text-lg font-semibold">
                Results Not Available Yet
              </p>
              <p className="text-sm">
                {election.status !== 'CLOSED'
                  ? "The election is still ongoing. Results will be available after the election is closed and results are published."
                  : "The election has ended. Results will be published by the election board shortly."}
              </p>
            </div>
          ) : resultsCharts.length > 0 ? (
            <div className="space-y-6">
              {resultsCharts.map((chart: any, idx: number) => (
                <Card key={idx}>
                  <CardHeader>
                    <CardTitle>{chart.position}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <Bar
                        data={chart.data}
                        options={{ maintainAspectRatio: false }}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-gray-500 space-y-4">
              <p className="text-lg">
                No results available yet for this election.
              </p>
              <p className="text-sm">
                Votes may not have been cast yet, or the election has not been closed. 
              </p>
              <Button
                variant="outline"
                className="mt-2 cursor-pointer"
                onClick={() => router.push('/validator/audit')}
              >
                View Audit Logs
              </Button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}