"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, ChevronDown, ChevronRight, LogOut, User } from "lucide-react";
import { Home, FileText, BarChart3, Shield, CheckCircle2 } from "lucide-react";

const DashboardIcon = Home;
const CandidatesIcon = FileText;
const ResultsIcon = BarChart3;
const AuditIcon = Shield;
const IntegrityIcon = CheckCircle2;

type NavSubItem = {
  name: string;
  href: string;
};

type NavItem = {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  subItems: NavSubItem[];
};

export const navItems: NavItem[] = [
  { name: "Dashboard", icon: DashboardIcon, href: "/validator", subItems: [] },
  { name: "Candidates", icon: CandidatesIcon, href: "/validator/candidates", subItems: [] },
  { name: "Results", icon: ResultsIcon, href: "/validator/results", subItems: [] },
  { name: "Audit Logs", icon: AuditIcon, href: "/validator/audit", subItems: [] },
  { name: "Integrity Check", icon: IntegrityIcon, href: "/validator/integrity", subItems: [] },
];

type SidebarProps = {
  userName?: string;
};

export default function Sidebar({ userName = "Validator" }: SidebarProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedMenus, setExpandedMenus] = useState<{ [key: string]: boolean }>({});
  const pathname = usePathname();
  const router = useRouter();

  const toggleMenu = (key: string) => {
    setExpandedMenus((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleLogout = () => {
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
            />
          </div>
        ) : (
          <div className="w-full flex justify-center">
            <Image
              src="/eCASVote_minimizedlogo.png"
              alt="eCASVote"
              width={40}
              height={40}
              className="object-contain"
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
                  onClick={() => router.push(item.href)}
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
                          isSubActive ? "bg-[#7A0019] text-white" : "text-gray-600 hover:bg-gray-50"
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
          <div className="w-10 h-10 bg-[#7A0019] rounded-full flex items-center justify-center text-white font-semibold">
            V
          </div>
          {sidebarOpen && (
            <>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">{userName}</div>
                <div className="text-xs text-gray-500">Read-Only Access</div>
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