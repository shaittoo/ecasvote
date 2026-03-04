"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AdminSidebar } from "@/components/Sidebar";
import AdminHeader from "../components/header";

// mock scanning
interface Election {
  id: string;
  title: string;
  academicYear: string;
  semester: string;
  active: boolean;
}

export default function BallotScanningPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [activeElection, setActiveElection] = useState<Election | null>(null);
  const [scannedBallots, setScannedBallots] = useState<string[]>([]);

  // Mock fetching elections
  useEffect(() => {
    setTimeout(() => {
      const elections: Election[] = [
        {
          id: "1",
          title: "CAS SC Elections 2026",
          academicYear: "2025-2026",
          semester: "2nd Semester",
          active: true,
        },
      ];
      const active = elections.find((e) => e.active) || null;
      setActiveElection(active);
      setLoading(false);
    }, 800);
  }, []);

  const handleScanDocument = () => {
    if (!activeElection) {
      alert("No active election to scan ballots for.");
      return;
    }

    // Mock scanning document
    const newBallotId = `BALLOT-${Date.now()}`;
    setScannedBallots((prev) => [newBallotId, ...prev]);
  };

  const handleLogout = () => {
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AdminSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        active="ballot"
        userName="Admin"
        onLogout={handleLogout}
        fixed
        pathname={pathname}
      />

      <div className="flex-1 flex flex-col">
        <AdminHeader title="Ballot Scanning" sidebarOpen={sidebarOpen} />

        <main className={`flex-1 p-6 overflow-y-auto transition-all duration-300 ${
          sidebarOpen ? "ml-64" : "ml-20"
        }`}>
          {loading ? (
            <div className="text-center py-12 text-gray-500">
              Loading elections...
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Active Election</CardTitle>
                  {!activeElection ? (
                    <div className="text-gray-500 py-4">
                      There is no active election at the moment.
                    </div>
                  ) : (
                    <div className="py-4 flex flex-col gap-2">
                      <div><strong>Title:</strong> {activeElection.title}</div>
                      <div><strong>Academic Year:</strong> {activeElection.academicYear}</div>
                      <div><strong>Semester:</strong> {activeElection.semester}</div>
                      <Button
                        className="bg-blue-600 text-white mt-2 cursor-pointer"
                        onClick={handleScanDocument}
                      >
                        Scan Ballot
                      </Button>
                    </div>
                  )}
                </CardHeader>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Scanned Ballots</CardTitle>
                </CardHeader>
                <CardContent>
                  {scannedBallots.length === 0 ? (
                    <div className="text-gray-500 py-10 text-center">
                      No ballots scanned yet.
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {scannedBallots.map((ballot, idx) => (
                        <li key={idx} className="border p-2 rounded bg-gray-50">
                          {ballot}
                        </li>
                      ))}
                    </ul>
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