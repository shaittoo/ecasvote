"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchPositions } from "@/lib/ecasvoteApi";
import type { Position } from "@/lib/ecasvoteApi";
import { StudentVoterSidebar } from "@/components/Sidebar";
import StudentVoterHeader from "../components/header";
import { CandidateCard } from "@/components/candidate-card";
import { Users } from "lucide-react";

const ELECTION_ID = "election-2025";

export default function StudentVoterCandidatesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPositions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPositions(ELECTION_ID);
      setPositions(data || []);
    } catch (error) {
      console.error("Failed to load positions:", error);
      setPositions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPositions();
  }, [loadPositions]);

  const handleLogout = () => router.push("/login");

  return (
    <div className="min-h-screen bg-muted/40 flex">
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
          <StudentVoterHeader
            title="Candidates"
            subtitle="Review all candidates and their information"
            sidebarOpen={sidebarOpen}
          />
        </div>

        <main
          className={`flex-1 overflow-y-auto p-4 transition-all duration-300 sm:p-6 ${
            sidebarOpen ? "ml-64" : "ml-20"
          }`}
        >
          <div className="mx-auto max-w-6xl space-y-6">
            {loading ? (
              <div className="rounded-xl border border-dashed bg-muted/30 py-16 text-center text-sm text-muted-foreground">
                Loading candidates…
              </div>
            ) : positions.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-card py-16 text-center">
                <Users className="mx-auto h-10 w-10 text-muted-foreground/50" aria-hidden />
                <p className="mt-3 text-sm font-medium text-foreground">No positions found</p>
                <p className="mt-1 text-xs text-muted-foreground">Check back later.</p>
              </div>
            ) : (
              <div className="space-y-8">
                {positions.map((position) => (
                  <Card key={position.id} className="overflow-hidden border-border/80 shadow-sm">
                    <CardHeader className="border-b bg-muted/25 pb-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-xl font-semibold tracking-tight">
                            {position.name}
                          </CardTitle>
                          <CardDescription className="text-sm">
                            You may vote for up to {position.maxVotes} candidate
                            {position.maxVotes === 1 ? "" : "s"} in this race.
                          </CardDescription>
                        </div>
                        <Badge
                          variant="secondary"
                          className="w-fit shrink-0 border border-border/80 bg-background font-medium"
                        >
                          Max {position.maxVotes} vote{position.maxVotes === 1 ? "" : "s"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-6">
                      {position.candidates.length === 0 ? (
                        <p className="text-center text-sm text-muted-foreground py-6">
                          No candidates for this position yet.
                        </p>
                      ) : (
                        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {position.candidates.map((candidate) => (
                            <li key={candidate.id}>
                              <CandidateCard candidate={candidate} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
