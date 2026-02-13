"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Menu,
  ChevronDown,
  ChevronRight,
  User,
  LogOut,
} from "lucide-react";

import { Home, BookOpen, Vote, Users, BarChart3, FolderOpen } from "lucide-react";

const DashboardIcon = Home;
const BookIcon = BookOpen;
const BallotIcon = Vote;
const ListIcon = Users;
const ChartIcon = BarChart3;
const FolderIcon = FolderOpen;

export const navItems = [
  { name: "Dashboard", icon: DashboardIcon, href: "/admin" },
  { name: "Onboarding", icon: BookIcon, href: "#" },
  { name: "Election Management", icon: BallotIcon, href: "/admin/election-management" },
  {
    name: "Voter Management",
    icon: ListIcon,
    href: "#",
    subItems: [
      { name: "Voter Roster", href: "/admin/voter-management/voter-roster" },
      { name: "Token Status", href: "/admin/voter-management/token-status" },
    ],
  },
  {
    name: "Tally & Results",
    icon: ChartIcon,
    href: "#",
    subItems: [
      { name: "Voter Turnout", href: "/admin/tally-results/voter-turnout" },
      { name: "Results Summary", href: "/admin/tally-results/summary-result" },
      { name: "Integrity Check", href: "/admin/tally-results/integrity-check" },
    ],
  },
  {
    name: "Audit & Logs",
    icon: FolderIcon,
    href: "#",
    subItems: [
      { name: "Audit Trail Viewer", href: "/admin/audit-and-logs/audit-trail" },
      { name: "System Activity Logs", href: "/admin/audit-and-logs/system-activity" },
    ],
  },
];

type SidebarProps = {
  userName?: string;
};

export default function Sidebar({ userName = "John Doe" }: SidebarProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedMenus, setExpandedMenus] = useState<{ [key: string]: boolean }>({});
  const pathname = usePathname();
  const router = useRouter();

  const toggleMenu = (key: string) => {
    setExpandedMenus((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleLogout = () => {
    localStorage.removeItem("authToken"); 
    router.push("/login"); 
  };

  return (
    <aside
      className={`bg-white border-r border-gray-200 transition-all duration-300 flex flex-col ${
        sidebarOpen ? "w-64" : "w-20"
      }`}
    >
      {/* Logo & Menu Toggle */}
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
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-1 flex-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const hasSubItems = item.subItems && item.subItems.length > 0;
          const isExpanded = expandedMenus[item.name.toLowerCase().replace(/\s+/g, "")] || false;
          const isActive =
            item.href === pathname ||
            (item.subItems?.some((sub) => sub.href === pathname) ?? false);

          return (
            <div key={item.name}>
              {!hasSubItems ? (
                <div
                  onClick={() => item.href !== "#" && router.push(item.href)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors cursor-pointer ${
                    isActive ? "bg-[#7A0019] text-white" : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {sidebarOpen && <span className="font-medium flex-1">{item.name}</span>}
                </div>
              ) : (
                <div
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors cursor-pointer ${
                    isActive ? "bg-[#7A0019] text-white" : "text-gray-700 hover:bg-gray-100"
                  }`}
                  onClick={() => sidebarOpen && toggleMenu(item.name.toLowerCase().replace(/\s+/g, ""))}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
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
                  {item.subItems!.map((subItem) => {
                    const isSubActive = subItem.href === pathname;
                    return (
                      <Link
                        key={subItem.name}
                        href={subItem.href}
                        className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg ${
                          isSubActive
                            ? "bg-[#7A0019] text-white"
                            : "text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        <span>{subItem.name}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
            <User className="h-5 w-5 text-muted-foreground" />
          </div>
          {sidebarOpen && (
            <>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">{userName}</div>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout">
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}