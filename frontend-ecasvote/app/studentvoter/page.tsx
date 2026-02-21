"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Bell, Settings, HelpCircle } from "lucide-react";
import { fetchDashboard } from "@/lib/ecasvoteApi";
import { StudentVoterSidebar } from "@/components/Sidebar";
import StudentVoterHeader from "./components/header";
import GreetingCard from "@/components/greeting-card";

const ELECTION_ID = 'election-2025';

export default function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [voterInfo, setVoterInfo] = useState<any>(null);

  useEffect(() => {
    // Load voter info from localStorage
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
        console.error('Failed to load dashboard data:', err);
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

      {/* Main Content */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ${
        sidebarOpen ? "ml-64" : "ml-20"
      }`}>
        <StudentVoterHeader 
          title="Student Dashboard" 
          sidebarOpen={sidebarOpen}
          actions={
            voterInfo?.studentNumber && (
              <div className="px-3 py-1 bg-gray-100 rounded-md text-sm text-gray-600">
                Student Number: {voterInfo.studentNumber}
              </div>
            )
          }
        />
        {/* Main Content Area */}
        <main className="flex-1 p-2 overflow-y-auto">
          <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="space-y-6">
              <GreetingCard
                name={voterInfo?.fullName?.split(" ")[0] || "User"}
                role=""
                hasVoted={voterInfo?.hasVoted}
              />

              {/* Election Status Card */}
              {loading ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Election Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-8">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-4"></div>
                      <p className="text-gray-500">Loading election data...</p>
                    </div>
                  </CardContent>
                </Card>
              ) : election && election.status === 'OPEN' ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Election Status</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-medium mb-1">
                          {election.name}
                        </h3>
                        <Badge variant="default" className="bg-green-600 text-white">
                          Open
                        </Badge>
                      </div>
                    </div>
                    <Link 
                      href="/vote" 
                      className={cn(
                        buttonVariants({ variant: "default", size: "default" }), 
                        "w-full text-white inline-block text-center"
                      )} 
                      style={{ backgroundColor: "#7A0019" }}
                    >
                      Cast Your Vote
                    </Link>
                  </CardContent>
                </Card>
              ) : election && election.status === 'CLOSED' ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Election Status</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-medium mb-1">
                          {election.name}
                        </h3>
                        <Badge variant="secondary" className="bg-gray-500 text-white">
                          Closed
                        </Badge>
                      </div>
                    </div>
                    <Link 
                      href="/results" 
                      className={cn(
                        buttonVariants({ variant: "default", size: "default" }), 
                        "w-full text-white inline-block text-center"
                      )} 
                      style={{ backgroundColor: "#7A0019" }}
                    >
                      View Results
                    </Link>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Election Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-8">
                      <p className="text-gray-500">No active elections at this time.</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Neutral Thank You Message */}
              {election && (
                <div className="text-center pt-2">
                  <p className="text-sm text-muted-foreground">
                    Thank you for participating in the CAS Student Council Elections.
                  </p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
