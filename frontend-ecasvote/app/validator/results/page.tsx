"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchPositions, fetchResults } from "@/lib/ecasvoteApi";
import type { Position, ResultsJson } from "@/lib/ecasvoteApi";
import Sidebar from "../components/sidebar";

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

const ELECTION_ID = "election-2025";

export default function ValidatorResultsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [results, setResults] = useState<ResultsJson | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [positionsData, resultsData] = await Promise.all([
          fetchPositions(ELECTION_ID),
          fetchResults(ELECTION_ID),
        ]);

        setPositions(positionsData || []);
        setResults(resultsData || null);
      } catch (error) {
        console.error("Failed to load results:", error);
        setPositions([]);
        setResults(null);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

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
      <Sidebar />

      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-5">
          <h1 className="text-2xl font-semibold text-gray-900">
            Election Results
          </h1>
        </header>

        {/* Main */}
        <main className="p-6 space-y-6">
          {loading ? (
            <div className="text-center py-12 text-gray-500">
              Loading results...
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
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                No results available yet
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}