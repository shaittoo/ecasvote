"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchDashboard } from "@/lib/ecasvoteApi";
import type { Election } from "@/lib/ecasvoteApi";
import { StudentVoterSidebar } from "@/components/Sidebar";
import StudentVoterHeader from "./components/header";
import GreetingCard from "@/components/greeting-card";
import { Loader2 } from "lucide-react";

const ELECTION_ID = "election-2025";

export default function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dashboardData, setDashboardData] = useState<{
    election?: Election | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [voterInfo, setVoterInfo] = useState<{
    fullName?: string;
    studentNumber?: string;
    hasVoted?: boolean;
  } | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedVoter = localStorage.getItem("voter");
      if (storedVoter) {
        try {
          setVoterInfo(JSON.parse(storedVoter));
        } catch (e) {
          console.error("Failed to parse voter info:", e);
        }
      }
    }

    async function loadDashboard() {
      try {
        const data = await fetchDashboard(ELECTION_ID);
        setDashboardData(data);
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  const handleLogout = () => {
    router.push("/login");
  };

  const sidebarUserName = voterInfo?.fullName || "User";
  const election = dashboardData?.election;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <StudentVoterSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        active="dashboard"
        userName={sidebarUserName}
        onLogout={handleLogout}
        fixed
        pathname={pathname}
      />

      <div
        className={`flex-1 flex flex-col transition-all duration-300 ${
          sidebarOpen ? "ml-64" : "ml-20"
        }`}
      >
        <StudentVoterHeader
          title="Student Dashboard"
          subtitle="CAS Student Council elections"
          sidebarOpen={sidebarOpen}
          actions={
            voterInfo?.studentNumber ? (
              <div className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Student No.</span>{" "}
                {voterInfo.studentNumber}
              </div>
            ) : undefined
          }
        />

        <main className="flex-1 overflow-y-auto p-2">
          <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="space-y-6">
              <GreetingCard
                name={voterInfo?.fullName?.split(" ")[0] || "User"}
                role=""
                hasVoted={voterInfo?.hasVoted}
              />

              <Card>
                <CardHeader>
                  <CardTitle>Election information</CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="flex flex-col items-center justify-center gap-4 py-10">
                      <Loader2
                        className="h-8 w-8 animate-spin text-[#7A0019]"
                        aria-hidden
                      />
                      <p className="text-sm text-muted-foreground">Loading election data…</p>
                    </div>
                  ) : election ? (
                    <div className="space-y-6">
                      <div>
                        <p className="text-sm text-gray-600">Election name</p>
                        <p className="text-lg font-semibold">{election.name}</p>
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <p className="text-sm text-gray-600">Status</p>
                          <Badge
                            className={
                              election.status === "OPEN"
                                ? "bg-green-500 text-white hover:bg-green-500"
                                : election.status === "CLOSED"
                                  ? "bg-red-500 text-white hover:bg-red-500"
                                  : "bg-gray-500 text-white hover:bg-gray-500"
                            }
                          >
                            {election.status}
                          </Badge>
                        </div>

                        <div>
                          <p className="text-sm text-gray-600">Description</p>
                          <p className="font-medium">{election.description || "N/A"}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <p className="text-sm text-gray-600">Start time</p>
                          <p className="font-medium">
                            {new Date(election.startTime).toLocaleString("en-US", {
                              timeZone: "Asia/Manila",
                            })}
                          </p>
                        </div>

                        <div>
                          <p className="text-sm text-gray-600">End time</p>
                          <p className="font-medium">
                            {new Date(election.endTime).toLocaleString("en-US", {
                              timeZone: "Asia/Manila",
                            })}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col items-center border-t pt-6">
                        {election.status === "OPEN" ? (
                          <Link
                            href="/vote"
                            className={cn(
                              buttonVariants({ size: "lg" }),
                              "inline-flex w-full max-w-sm justify-center bg-[#7A0019] text-white hover:bg-[#5c0013] sm:w-auto sm:min-w-[220px]"
                            )}
                          >
                            Cast your vote
                          </Link>
                        ) : election.status === "CLOSED" ? (
                          <Link
                            href="/studentvoter/results"
                            className={cn(
                              buttonVariants({ size: "lg" }),
                              "inline-flex w-full max-w-sm justify-center bg-[#7A0019] text-white hover:bg-[#5c0013] sm:w-auto sm:min-w-[220px]"
                            )}
                          >
                            View results
                          </Link>
                        ) : (
                          <p className="text-center text-sm text-muted-foreground">
                            This election is not open for voting yet.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 text-center">
                      <p className="text-gray-500">No active elections at this time.</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {election ? (
                <p className="text-center text-sm text-muted-foreground">
                  Thank you for participating in the CAS Student Council elections.
                </p>
              ) : null}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
