"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import React from "react";
import {
  Menu,
  LogOut,
  User,
  Home,
  BookOpen,
  CheckSquare,
  Shield,
  BarChart3,
  FileText,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Vote,
  Users,
  FolderOpen,
} from "lucide-react";  
import type { LucideIcon } from "lucide-react";

type SidebarItem = {
  key: string;
  name: string;
  href?: string;
  icon: LucideIcon;
  subItems?: SidebarSubItem[];
};

type SidebarSubItem = {
  name: string;
  href: string;
};

type SidebarShellProps = {
  open: boolean;
  onToggle: () => void;
  items: SidebarItem[];
  activeKey: string;
  userName: string;
  onLogout: () => void;
  fixed?: boolean;
  useButtons?: boolean;
  onItemClick?: (key: string) => void;
  pathname?: string;
};

function SidebarShell({
  open,
  onToggle,
  items,
  activeKey,
  userName,
  onLogout,
  fixed = true,
  useButtons = false,
  onItemClick,
  pathname = "",
}: SidebarShellProps) {
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});
  const router = useRouter();

  // Auto-expand parent menus when their sub-items are active
  React.useEffect(() => {
    const newExpandedMenus: Record<string, boolean> = {};
    items.forEach((item) => {
      if (item.subItems?.some((sub) => sub.href === pathname)) {
        newExpandedMenus[item.key] = true;
      }
    });
    if (Object.keys(newExpandedMenus).length > 0) {
      setExpandedMenus((prev) => ({ ...prev, ...newExpandedMenus }));
    }
  }, [pathname, items]);

  const toggleMenu = (key: string) => {
    setExpandedMenus((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <aside
      className={`bg-white border-r border-gray-200 transition-all duration-300 flex flex-col overflow-hidden ${
        open ? "w-64" : "w-20"
      } ${fixed ? "fixed left-0 top-0 h-screen z-10" : ""}`}
    >
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        {open ? (
          <div className="flex items-center gap-2">
            <Image
              src="/ecasvotelogo.jpeg"
              alt="eCASVote Logo"
              width={200}
              height={40}
              className="object-contain"
              priority
            />
          </div>
        ) : !open ? (
          <div className="w-full flex justify-center">
            <Image
              src="/eCASVote_minimizedlogo.png"
              alt="eCASVote"
              width={40}
              height={40}
              className="object-contain"
              priority
            />
          </div>
        ) : null}
        <Button variant="ghost" size="icon" onClick={onToggle}>
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      <nav className="p-4 space-y-1 flex-1 overflow-y-auto">
        {items.map((item) => {
          const Icon = item.icon;
          const hasSubItems = item.subItems && item.subItems.length > 0;
          const isExpanded = expandedMenus[item.key] || false;
          const isActive =
            item.key === activeKey ||
            (item.subItems?.some((sub) => sub.href === pathname) ?? false);

          const classes = `w-full flex ${open ? 'items-center' : 'justify-center'} gap-3 ${open ? 'px-4' : 'px-0'} py-3 rounded-lg transition-colors text-left ${
            isActive
              ? "bg-[#7A0019] text-white"
              : "text-gray-700 hover:bg-gray-100"
          }`;
          
          const iconSize = open ? "h-5 w-5" : "h-5 w-5";

          if (!hasSubItems) {
            if (useButtons) {
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() =>
                    onItemClick
                      ? onItemClick(item.key)
                      : item.href && router.push(item.href)
                  }
                  className={classes}
                >
                  <Icon className={iconSize} />
                  {open && <span className="font-medium">{item.name}</span>}
                </button>
              );
            }

            return (
              <Link
                key={item.key}
                href={item.href || "#"}
                className={classes}
              >
                <Icon className={iconSize} />
                {open && <span className="font-medium">{item.name}</span>}
              </Link>
            );
          }

          return (
            <div key={item.key}>
              <button
                type="button"
                onClick={() => open && toggleMenu(item.key)}
                className={classes}
              >
                <Icon className={iconSize} />
                {open && (
                  <>
                    <span className="font-medium flex-1">{item.name}</span>
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </>
                )}
              </button>

              {open && hasSubItems && isExpanded && (
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

      <div className="p-4 border-t border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
            <User className="h-5 w-5 text-gray-600" />
          </div>
          {open && (
            <>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">
                  {userName}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onLogout}
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

// Student Voter Items
export type StudentVoterNavKey =
  | "dashboard"
  | "onboarding"
  | "vote"
  | "privacy"
  | "results";

const studentVoterItems: SidebarItem[] = [
  {
    key: "dashboard",
    name: "Dashboard",
    href: "/studentvoter",
    icon: Home,
  },
  { key: "onboarding", name: "Onboarding", href: "#", icon: BookOpen },
  { key: "vote", name: "Cast Vote", href: "/studentvoter/castvote", icon: CheckSquare },
  { key: "privacy", name: "Privacy Statement", href: "#", icon: Shield },
  { key: "results", name: "Election Results", href: "/studentvoter/results", icon: BarChart3 },
];

export function StudentVoterSidebar(props: {
  open: boolean;
  onToggle: () => void;
  active: StudentVoterNavKey;
  userName: string;
  onLogout: () => void;
  fixed?: boolean;
  pathname?: string;
}) {
  return (
    <SidebarShell
      open={props.open}
      onToggle={props.onToggle}
      items={studentVoterItems}
      activeKey={props.active}
      userName={props.userName}
      onLogout={props.onLogout}
      fixed={props.fixed}
      pathname={props.pathname}
    />
  );
}

// Validator Items
export type ValidatorNavKey =
  | "overview"
  | "candidates"
  | "results"
  | "audit"
  | "integrity";

const validatorItems: SidebarItem[] = [
  { key: "overview", name: "Dashboard", href: "/validator", icon: Home },
  { key: "candidates", name: "Candidates", href: "/validator/candidates", icon: FileText },
  { key: "results", name: "Results", href: "/validator/results", icon: BarChart3 },
  { key: "audit", name: "Audit Logs", href: "/validator/audit", icon: Shield },
  {
    key: "integrity",
    name: "Integrity Check",
    href: "/validator/integrity",
    icon: CheckCircle2,
  },
];

export function ValidatorSidebar(props: {
  open: boolean;
  onToggle: () => void;
  active: ValidatorNavKey;
  userName: string;
  onLogout: () => void;
  onSelect?: (key: ValidatorNavKey) => void;
  fixed?: boolean;
  pathname?: string;
}) {
  return (
    <SidebarShell
      open={props.open}
      onToggle={props.onToggle}
      items={validatorItems}
      activeKey={props.active}
      userName={props.userName}
      onLogout={props.onLogout}
      fixed={props.fixed}
      pathname={props.pathname}
    />
  );
}

// Admin Items
export type AdminNavKey =
  | "dashboard"
  | "onboarding"
  | "election"
  | "voter"
  | "tally"
  | "audit";

const adminItems: SidebarItem[] = [
  { key: "dashboard", name: "Dashboard", href: "/admin", icon: Home },
  { key: "onboarding", name: "Onboarding", href: "#", icon: BookOpen },
  {
    key: "election",
    name: "Election Management",
    href: "/admin/election-management",
    icon: Vote,
  },
  {
    key: "voter",
    name: "Voter Management",
    href: "#",
    icon: Users,
    subItems: [
      { name: "Voter Roster", href: "/admin/voter-management/voter-roster" },
      { name: "Token Status", href: "/admin/voter-management/token-status" },
    ],
  },
  {
    key: "tally",
    name: "Tally & Results",
    href: "#",
    icon: BarChart3,
    subItems: [
      { name: "Voter Turnout", href: "/admin/tally-results/voter-turnout" },
      { name: "Results Summary", href: "/admin/tally-results/summary-result" },
      { name: "Integrity Check", href: "/admin/tally-results/integrity-check" },
    ],
  },
  {
    key: "audit",
    name: "Audit & Logs",
    href: "#",
    icon: FolderOpen,
    subItems: [
      { name: "Audit Trail Viewer", href: "/admin/audit-and-logs/audit-trail" },
      { name: "System Activity Logs", href: "/admin/audit-and-logs/system-activity" },
    ],
  },
];

export function AdminSidebar(props: {
  open: boolean;
  onToggle: () => void;
  active: AdminNavKey;
  userName: string;
  onLogout: () => void;
  fixed?: boolean;
  pathname?: string;
}) {
  return (
    <SidebarShell
      open={props.open}
      onToggle={props.onToggle}
      items={adminItems}
      activeKey={props.active}
      userName={props.userName}
      onLogout={props.onLogout}
      fixed={props.fixed}
      pathname={props.pathname}
    />
  );
}
