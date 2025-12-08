"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
} from "chart.js";
import { Doughnut, Bar } from "react-chartjs-2";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, Bell, Settings, HelpCircle, Menu, LogOut, User, ChevronDown, ChevronRight, Home, BookOpen, Vote, Users, BarChart3, FolderOpen, FileText, Grid } from "lucide-react";
import { fetchDashboard, fetchElection, openElection } from "@/lib/ecasvoteApi";

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const ELECTION_ID = 'election-2025';

// Icons
const DashboardIcon = Home;
const BookIcon = BookOpen;
const BallotIcon = Vote;
const ListIcon = Users;
const ChartIcon = BarChart3;
const FolderIcon = FolderOpen;

// Countdown Timer Component
function CountdownTimer() {
  const [timeLeft, setTimeLeft] = useState({
    days: 3,
    hours: 12,
    minutes: 25,
    seconds: 40,
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        let { days, hours, minutes, seconds } = prev;
        
        if (seconds > 0) {
          seconds--;
        } else if (minutes > 0) {
          minutes--;
          seconds = 59;
        } else if (hours > 0) {
          hours--;
          minutes = 59;
          seconds = 59;
        } else if (days > 0) {
          days--;
          hours = 23;
          minutes = 59;
          seconds = 59;
        }
        
        return { days, hours, minutes, seconds };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
      <div className="text-2xl font-semibold text-gray-900">
        {String(timeLeft.days).padStart(2, "0")} days : {String(timeLeft.hours).padStart(2, "0")} hours : {String(timeLeft.minutes).padStart(2, "0")} minutes : {String(timeLeft.seconds).padStart(2, "0")} seconds
      </div>
    </div>
  );
}

// Horizontal Bar Chart Component for Group Breakdown
function GroupBreakdownChart({ groups }: { groups: Array<{ name: string; voted: number; total: number; color: string }> }) {
  const data = {
    labels: groups.map(g => g.name),
    datasets: [
      {
        label: 'Voted',
        data: groups.map(g => (g.voted / g.total) * 100),
        backgroundColor: groups.map(g => g.color),
        borderRadius: 4,
      },
      {
        label: 'Not Voted',
        data: groups.map(g => ((g.total - g.voted) / g.total) * 100),
        backgroundColor: '#e5e7eb',
        borderRadius: 4,
      },
    ],
  };

  const options = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            const groupIndex = context.dataIndex;
            const group = groups[groupIndex];
            if (context.datasetIndex === 0) {
              return `${group.voted} out of ${group.total} (${Math.round((group.voted / group.total) * 100)}%)`;
            } else {
              return `${group.total - group.voted} out of ${group.total} (${Math.round(((group.total - group.voted) / group.total) * 100)}%)`;
            }
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        max: 100,
        ticks: {
          callback: function(value: any) {
            return value + '%';
          },
        },
      },
      y: {
        stacked: true,
      },
    },
  };

  return (
    <div className="w-full h-64">
      <Bar data={data} options={options} />
    </div>
  );
}

// Calendar Component
function ElectionCalendar() {
  const [currentMonth, setCurrentMonth] = useState(new Date(2025, 4, 1)); // May 2025
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const daysOfWeek = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const lastDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();
  const startingDayOfWeek = firstDayOfMonth.getDay();

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const isElectionPeriod = (day: number) => {
    return day >= 19 && day <= 24;
  };

  const isToday = (day: number) => {
    const today = new Date();
    return (
      day === 9 &&
      currentMonth.getMonth() === today.getMonth() &&
      currentMonth.getFullYear() === today.getFullYear()
    );
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="icon" onClick={prevMonth}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Button>
          <h3 className="font-semibold">
            {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </h3>
          <Button variant="ghost" size="icon" onClick={nextMonth}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {daysOfWeek.map((day) => (
            <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: startingDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square"></div>
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const isElection = isElectionPeriod(day);
            const isTodayDate = isToday(day);
            return (
              <div
                key={day}
                className={`aspect-square flex items-center justify-center text-sm ${
                  isTodayDate ? "bg-muted rounded-full" : ""
                } ${isElection ? "bg-green-100 rounded" : ""}`}
              >
                {day}
              </div>
            );
          })}
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-100 rounded"></div>
            <span>Election Period</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
    election: false,
    voter: false,
    tally: false,
    audit: false,
  });

  useEffect(() => {
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

  const toggleMenu = (menu: string) => {
    setExpandedMenus(prev => ({ ...prev, [menu]: !prev[menu] }));
  };

  const stats = dashboardData?.statistics || { totalVoters: 1200, votedCount: 890, notVotedCount: 310 };
  const election = dashboardData?.election;
  const announcements = dashboardData?.announcements || [];
  
  // Get the most recent transaction from audit logs
  const lastTransaction = announcements.find((a: any) => a.txId) || null;

  // Mock group data - in real app, this would come from the database
  const groups = [
    { name: "Red Bolts", voted: 184, total: 200, color: "#dc2626" },
    { name: "Skimmers", voted: 252, total: 300, color: "#9333ea" },
    { name: "Elektrons", voted: 380, total: 500, color: "#ea580c" },
    { name: "Clovers", voted: 74, total: 200, color: "#16a34a" },
  ];

  const navItems = [
    { name: "Dashboard", icon: DashboardIcon, href: "/admin", active: true },
    { name: "Onboarding", icon: BookIcon, href: "#" },
    {
      name: "Election Management",
      icon: BallotIcon,
      href: "#",
      subItems: [
        { name: "Create Election", href: "#" },
        { name: "Ballot Setup", href: "#" },
        { name: "Candidate Management", href: "#" },
      ],
    },
    {
      name: "Voter Management",
      icon: ListIcon,
      href: "#",
      subItems: [
        { name: "Voter Roster", href: "#" },
        { name: "Token Status", href: "#" },
      ],
    },
    {
      name: "Tally & Results",
      icon: ChartIcon,
      href: "#",
      subItems: [
        { name: "Voter Turnout", href: "#" },
        { name: "Results Summary", href: "#" },
        { name: "Detailed Statistics", href: "#" },
      ],
    },
    {
      name: "Audit & Logs",
      icon: FolderIcon,
      href: "#",
      subItems: [
        { name: "Audit Trail Viewer", href: "#" },
        { name: "System Activity Logs", href: "#" },
      ],
    },
  ];

  // Mock activity data - in real app, this would come from audit logs
  const activities = [
    { id: 1, type: "token", message: "Token issued to: Student #2045", timestamp: "10 minutes ago", icon: FileText },
    { id: 2, type: "election", message: "Newly Published Elections: 'CAS Student Council Elections 2026'", timestamp: "1 day ago", icon: Vote },
    { id: 3, type: "roster", message: "Student Roster updated", timestamp: "1 day ago", icon: Grid },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left Sidebar */}
      <aside
        className={`bg-white border-r border-gray-200 transition-all duration-300 flex flex-col ${
          sidebarOpen ? "w-64" : "w-20"
        }`}
      >
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          {sidebarOpen ? (
            <div className="flex items-center gap-2">
              <Image
                src="/ecasvotelogo.jpeg"
                alt="eCASVote Logo"
                width={120}
                height={40}
                className="object-contain"
                priority
              />
            </div>
          ) : (
            <div className="w-full flex justify-center">
              <Image
                src="/ecasvotelogo.jpeg"
                alt="eCASVote"
                width={40}
                height={40}
                className="object-contain"
                priority
              />
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        <nav className="p-4 space-y-1 flex-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const hasSubItems = item.subItems && item.subItems.length > 0;
            const isExpanded = expandedMenus[item.name.toLowerCase().replace(/\s+/g, '')] || false;

            return (
              <div key={item.name}>
                <div
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors cursor-pointer ${
                    item.active
                      ? "bg-[#7A0019] text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                  onClick={() => hasSubItems && sidebarOpen && toggleMenu(item.name.toLowerCase().replace(/\s+/g, ''))}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {sidebarOpen && (
                    <>
                      <span className="font-medium flex-1">{item.name}</span>
                      {hasSubItems && (
                        isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )
                      )}
                    </>
                  )}
                </div>
                {sidebarOpen && hasSubItems && isExpanded && (
                  <div className="ml-8 mt-1 space-y-1">
                    {item.subItems.map((subItem) => (
                      <Link
                        key={subItem.name}
                        href={subItem.href}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg"
                      >
                        <span>{subItem.name}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* User Profile Card */}
        <div className="p-4 border-t border-gray-200 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
              <User className="h-5 w-5 text-muted-foreground" />
            </div>
            {sidebarOpen && (
              <>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">John Doe</div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  title="Logout"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Top Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 max-w-2xl">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search keyword or actions..."
                  className="w-full pl-10 pr-20"
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-muted-foreground">
                  12 results
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 ml-6">
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full"></span>
              </Button>
              <Button variant="ghost" size="icon">
                <Settings className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon">
                <HelpCircle className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 p-2 overflow-y-auto">
          <div className="w-full max-w-8xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column */}
            <div className="lg:col-span-2 space-y-6">
              {/* Welcome Card */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle>Hello, John!</CardTitle>
                    <Badge variant="secondary" className="bg-[#7A0019] text-white">
                      SEB Admin
                    </Badge>
                  </div>
                  <CardDescription>
                    Welcome to UPV CAS Student Council's Online Voting System
                  </CardDescription>
                </CardHeader>
              </Card>

              {/* Ongoing Elections Card */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-muted-foreground">Admin Control Panel</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <CardTitle className="text-green-600">Ongoing Elections</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <h3 className="text-2xl font-bold mb-4">
                      {election?.name || "CAS Student Council Elections 2026"}
                    </h3>
                    <div className="flex items-center gap-4">
                      <CountdownTimer />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {election?.status === 'DRAFT' ? (
                      <Button
                        className="flex-1 text-white"
                        style={{ backgroundColor: "#0C8C3F" }}
                        onClick={async () => {
                          try {
                            await openElection(ELECTION_ID);
                            // Reload dashboard data
                            const data = await fetchDashboard(ELECTION_ID);
                            setDashboardData(data);
                          } catch (err) {
                            console.error('Failed to open election:', err);
                          }
                        }}
                      >
                        Open Election
                      </Button>
                    ) : election?.status === 'OPEN' ? (
                      <Button
                        className="flex-1 text-white"
                        style={{ backgroundColor: "#dc2626" }}
                        onClick={() => {
                          // TODO: Implement close election
                          alert('Close election functionality coming soon');
                        }}
                      >
                        Close Election
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        // TODO: Navigate to ballot setup
                        alert('Ballot setup page coming soon');
                      }}
                    >
                      Manage Election
                    </Button>
                  </div>
                  {lastTransaction?.txId && (
                    <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
                      <span className="font-medium">Last chain transaction:</span>{" "}
                      <span className="font-mono">TxID #{lastTransaction.txId.slice(0, 8)}</span>
                      {" "}({new Date(lastTransaction.createdAt).toLocaleTimeString()})
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Voter Turnout Card */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Voter Turnout</CardTitle>
                    <Tabs defaultValue="overall" className="w-auto">
                      <TabsList>
                        <TabsTrigger value="overall">Overall</TabsTrigger>
                        <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="overall">
                    <TabsContent value="overall" className="mt-4">
                      <div className="flex flex-col md:flex-row items-center gap-6">
                        <div className="relative w-48 h-48 mx-auto">
                          <Doughnut
                            data={{
                              labels: ["Voted", "Not Yet Voted"],
                              datasets: [
                                {
                                  data: [stats.votedCount, stats.notVotedCount],
                                  backgroundColor: ["#0C8C3F", "#e5e7eb"],
                                  borderWidth: 0,
                                },
                              ],
                            }}
                            options={{
                              responsive: true,
                              maintainAspectRatio: true,
                              cutout: "70%",
                              plugins: {
                                legend: { display: false },
                              },
                            }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="text-center">
                              <div className="text-3xl font-bold">{stats.votedCount}</div>
                              <div className="text-sm text-muted-foreground">Voted</div>
                            </div>
                          </div>
                        </div>
                        <div className="flex-1 w-full">
                          <p className="text-lg font-semibold mb-4" style={{ color: "#0C8C3F" }}>
                            {stats.votedCount} out of {stats.totalVoters} CAS Students
                          </p>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 rounded" style={{ backgroundColor: "#0C8C3F" }}></div>
                              <span className="text-sm text-muted-foreground">Voted {stats.votedCount}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 bg-muted rounded"></div>
                              <span className="text-sm text-muted-foreground">Not Yet Voted {stats.notVotedCount}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </TabsContent>
                    <TabsContent value="breakdown" className="mt-4">
                      <div className="space-y-4">
                        <GroupBreakdownChart groups={groups} />
                        <div className="space-y-3">
                          {groups.map((group) => (
                            <div key={group.name} className="flex items-center justify-between p-3 border rounded-lg">
                              <div className="flex items-center gap-3">
                                <div className="w-4 h-4 rounded" style={{ backgroundColor: group.color }}></div>
                                <span className="font-medium">{group.name}</span>
                              </div>
                              <span className="text-sm text-muted-foreground">
                                {group.voted} out of {group.total}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Calendar */}
              <ElectionCalendar />

              {/* Activity Summary */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Activity Summary</CardTitle>
                    <Button variant="ghost" size="icon">
                      <ChevronDown className="w-5 h-5" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between mb-4">
                    <Button variant="ghost" size="sm">
                      &lt; Previous
                    </Button>
                    <Button variant="ghost" size="sm">
                      Next &gt;
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {activities.map((activity) => {
                      const Icon = activity.icon;
                      return (
                        <div
                          key={activity.id}
                          className="flex items-start gap-3 p-3 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                        >
                          <Icon className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm">
                              {activity.message.split(':').map((part, i) => 
                                i === 1 ? (
                                  <span key={i} className="text-green-600 font-medium">{part}</span>
                                ) : (
                                  <span key={i}>{part}</span>
                                )
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">{activity.timestamp}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <Link href="#" className="block text-center text-sm text-primary mt-4 hover:underline">
                    View All Activities
                  </Link>
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Blockchain network:</span>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        <span className="w-2 h-2 bg-green-500 rounded-full mr-2 inline-block"></span>
                        ONLINE
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

