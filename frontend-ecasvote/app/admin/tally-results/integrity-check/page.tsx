"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  Menu,
  ChevronDown,
  ChevronRight,
  User,
  LogOut,
  Home,
  BookOpen,
  Vote,
  Users,
  BarChart3,
  FolderOpen,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchElection, fetchPositions, fetchIntegrityCheck } from "@/lib/ecasvoteApi";
import type { Position, IntegrityCheckData } from "@/lib/ecasvoteApi";

const ELECTION_ID = 'election-2025';

// Icons
const DashboardIcon = Home;
const BookIcon = BookOpen;
const BallotIcon = Vote;
const ListIcon = Users;
const ChartIcon = BarChart3;
const FolderIcon = FolderOpen;

type SubNavItem = {
  name: string;
  href: string;
  active?: boolean;
};

type NavItem = {
  name: string;
  icon: React.ComponentType<any>;
  href: string;
  active?: boolean;
  subItems?: SubNavItem[];
};

export default function AdminIntegrityCheckPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
    election: false,
    voter: false,
    tally: true,
    audit: false,
  });
  const [election, setElection] = useState<any>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [integrityData, setIntegrityData] = useState<IntegrityCheckData | null>(null);
  const [integrityLoading, setIntegrityLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adminInfo, setAdminInfo] = useState<any>(null);

  useEffect(() => {
    // Load admin info from localStorage
    if (typeof window !== "undefined") {
      const storedAdmin = localStorage.getItem("admin");
      if (storedAdmin) {
        try {
          setAdminInfo(JSON.parse(storedAdmin));
        } catch (e) {
          console.error("Failed to parse admin info:", e);
        }
      } else {
        setAdminInfo({ fullName: "SEB Admin" });
      }
    }

    async function loadData() {
      try {
        const [electionData, positionsData] = await Promise.all([
          fetchElection(ELECTION_ID).catch(() => null),
          fetchPositions(ELECTION_ID).catch(() => []),
        ]);
        setElection(electionData);
        setPositions(positionsData || []);
      } catch (err) {
        console.error('Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Load integrity check data
  const loadIntegrityData = async () => {
    setIntegrityLoading(true);
    try {
      const integrityCheckData = await fetchIntegrityCheck(ELECTION_ID);
      setIntegrityData(integrityCheckData);
    } catch (err) {
      console.error('Failed to load integrity check data:', err);
      setIntegrityData(null);
    } finally {
      setIntegrityLoading(false);
    }
  };

  // Auto-load integrity data when component mounts
  useEffect(() => {
    loadIntegrityData();
  }, []);

  const handleLogout = () => {
    router.push("/login");
  };

  const toggleMenu = (menu: string) => {
    setExpandedMenus((prev) => ({ ...prev, [menu]: !prev[menu] }));
  };

  const navItems: NavItem[] = [
    { name: "Dashboard", icon: DashboardIcon, href: "/admin" },
    { name: "Help Center", icon: BookIcon, href: "#" },
    { name: "Election Management", icon: BallotIcon, href: "/admin/election-management" },
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
      href: "/admin/tally-results",
      active: true,
      subItems: [
        { name: "Voter Turnout", href: "/admin/voter-turnout" },
        { name: "Results Summary", href: "/admin/tally-results/summary-result" },
        { name: "Integrity Check", href: "/admin/tally-results/integrity-check", active: true },
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

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <style jsx global>{`button { cursor: pointer; }`}</style>
      
      {/* Left Sidebar */}
      <aside
        className={`bg-white border-r border-gray-200 transition-all duration-300 flex flex-col fixed left-0 top-0 h-screen z-10 ${
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
            const menuKey = item.name.toLowerCase().replace(/\s+/g, "");
            const isExpanded = expandedMenus[menuKey] || false;
            const isActive = item.active || ((item.subItems || []).some((s) => s.active) ?? false);

            return (
              <div key={item.name}>
                {!hasSubItems ? (
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? "bg-[#7A0019] text-white"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {sidebarOpen && <span className="font-medium">{item.name}</span>}
                  </Link>
                ) : (
                  <div
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors cursor-pointer ${
                      isActive
                        ? "bg-[#7A0019] text-white"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                    onClick={() => sidebarOpen && toggleMenu(menuKey)}
                  >
                    <Icon className="w-5 h-5" />
                    {sidebarOpen && (
                      <>
                        <span className="font-medium flex-1">{item.name}</span>
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </>
                    )}
                  </div>
                )}

                {sidebarOpen && hasSubItems && isExpanded && (
                  <div className="ml-8 mt-1 space-y-1">
                    {item.subItems?.map((subItem) => (
                      <div
                        key={subItem.name}
                        onClick={() => {
                          if (subItem.href !== "#" && subItem.href !== pathname) {
                            router.push(subItem.href);
                          }
                        }}
                        className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg cursor-pointer ${
                          subItem.active
                            ? "bg-[#7A0019] text-white"
                            : "text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        <span>{subItem.name}</span>
                      </div>
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
                  <div className="font-medium text-gray-900 truncate">
                    {adminInfo?.fullName || "SEB Admin"}
                  </div>
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
      <div className={`flex-1 flex flex-col transition-all duration-300 ${
        sidebarOpen ? "ml-64" : "ml-20"
      }`}>
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Integrity Check</h1>
            <p className="text-sm text-gray-600 mt-1">Verify blockchain and database synchronization</p>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 p-6 overflow-y-auto">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Loading...</p>
            </div>
          ) : (
            <div className="w-full max-w-7xl mx-auto space-y-6">
              {/* Summary Card */}
              {integrityLoading ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-4"></div>
                    <p className="text-gray-500">Loading integrity verification...</p>
                    <p className="text-xs text-gray-400 mt-2">This may take a few seconds while we query the blockchain</p>
                  </CardContent>
                </Card>
              ) : integrityData && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Integrity Verification</CardTitle>
                        <CardDescription>
                          Compare blockchain vote counts with database records
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={loadIntegrityData}
                          disabled={integrityLoading}
                        >
                          <RefreshCw className={`w-4 h-4 mr-2 ${integrityLoading ? 'animate-spin' : ''}`} />
                          Refresh
                        </Button>
                        {integrityData.hasMismatch ? (
                          <Badge className="bg-red-500 text-white flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" />
                            Mismatch Detected
                          </Badge>
                        ) : (
                          <Badge className="bg-green-500 text-white flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4" />
                            All Matches
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="border rounded-lg p-4">
                        <p className="text-sm text-gray-600 mb-1">Blockchain Votes</p>
                        <p className="text-2xl font-bold text-gray-900">{integrityData.totals.blockchain}</p>
                      </div>
                      <div className="border rounded-lg p-4">
                        <p className="text-sm text-gray-600 mb-1">Database Votes</p>
                        <p className="text-2xl font-bold text-gray-900">{integrityData.totals.database}</p>
                      </div>
                      <div className="border rounded-lg p-4">
                        <p className="text-sm text-gray-600 mb-1">Status</p>
                        {integrityData.totals.match ? (
                          <p className="text-lg font-semibold text-green-600">✓ Match</p>
                        ) : (
                          <p className="text-lg font-semibold text-red-600">✗ Mismatch</p>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-4">
                      Last verified: {new Date(integrityData.timestamp).toLocaleString('en-US', { timeZone: 'Asia/Manila' })}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* On-Chain Vote Count Verification */}
              <Card>
                <CardHeader>
                  <CardTitle>On-Chain Vote Count Verification</CardTitle>
                  <CardDescription>
                    Vote counts directly from the blockchain (immutable record)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {integrityLoading ? (
                    <div className="text-center py-12 text-gray-500">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-4"></div>
                      <p>Loading integrity check data...</p>
                    </div>
                  ) : integrityData ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-3 px-4 font-semibold text-gray-900">Position</th>
                            <th className="text-left py-3 px-4 font-semibold text-gray-900">Candidate</th>
                            <th className="text-right py-3 px-4 font-semibold text-gray-900">Count from Blockchain</th>
                          </tr>
                        </thead>
                        <tbody>
                          {integrityData.comparison.map((item, index) => {
                            const position = positions.find(p => p.id === item.position);
                            const candidate = position?.candidates?.find(c => c.id === item.candidate);
                            const positionName = position?.name || item.position.replace(/-/g, ' ');
                            const candidateName = candidate?.name || item.candidate;
                            
                            return (
                              <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="py-3 px-4 font-medium">{positionName}</td>
                                <td className="py-3 px-4">{candidateName}</td>
                                <td className="py-3 px-4 text-right font-semibold">{item.blockchainCount}</td>
                              </tr>
                            );
                          })}
                          {integrityData.comparison.length === 0 && (
                            <tr>
                              <td colSpan={3} className="py-12 text-center text-gray-500">
                                No votes recorded yet
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      Failed to load integrity check data
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Off-Chain Vote Record Count Comparison */}
              <Card>
                <CardHeader>
                  <CardTitle>Off-Chain Vote Record Count</CardTitle>
                  <CardDescription>
                    Comparison between Prisma database and blockchain records
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {integrityLoading ? (
                    <div className="text-center py-12 text-gray-500">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-4"></div>
                      <p>Loading comparison data...</p>
                    </div>
                  ) : integrityData ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-3 px-4 font-semibold text-gray-900">Position</th>
                            <th className="text-left py-3 px-4 font-semibold text-gray-900">Candidate</th>
                            <th className="text-right py-3 px-4 font-semibold text-gray-900">Stored in Prisma</th>
                            <th className="text-right py-3 px-4 font-semibold text-gray-900">Stored in Blockchain</th>
                            <th className="text-center py-3 px-4 font-semibold text-gray-900">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {integrityData.comparison.map((item, index) => {
                            const position = positions.find(p => p.id === item.position);
                            const candidate = position?.candidates?.find(c => c.id === item.candidate);
                            const positionName = position?.name || item.position.replace(/-/g, ' ');
                            const candidateName = candidate?.name || item.candidate;
                            
                            return (
                              <tr 
                                key={index} 
                                className={`border-b border-gray-100 hover:bg-gray-50 ${
                                  !item.match ? 'bg-red-50' : ''
                                }`}
                              >
                                <td className="py-3 px-4 font-medium">{positionName}</td>
                                <td className="py-3 px-4">{candidateName}</td>
                                <td className="py-3 px-4 text-right">{item.databaseCount}</td>
                                <td className="py-3 px-4 text-right">{item.blockchainCount}</td>
                                <td className="py-3 px-4 text-center">
                                  {item.match ? (
                                    <Badge className="bg-green-500 text-white">✓ Match</Badge>
                                  ) : (
                                    <Badge className="bg-red-500 text-white flex items-center justify-center gap-1">
                                      <AlertTriangle className="w-3 h-3" />
                                      Mismatch
                                    </Badge>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                          {integrityData.comparison.length === 0 && (
                            <tr>
                              <td colSpan={5} className="py-12 text-center text-gray-500">
                                No votes recorded yet
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      Failed to load comparison data
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Warning Message */}
              {integrityData && integrityData.hasMismatch && (
                <Card className="border-red-200 bg-red-50">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                      <CardTitle className="text-red-900">Warning: Data Mismatch Detected</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-red-800">
                      There is a discrepancy between the blockchain records and the database records. 
                      This could indicate:
                    </p>
                    <ul className="list-disc list-inside mt-2 text-red-800 space-y-1">
                      <li>Database synchronization issues</li>
                      <li>Potential data manipulation</li>
                      <li>Incomplete transaction processing</li>
                    </ul>
                    <p className="text-red-800 mt-4 font-semibold">
                      Please investigate immediately. The blockchain record is the source of truth.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

