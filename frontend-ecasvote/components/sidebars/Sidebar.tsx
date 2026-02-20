"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Menu,
  LogOut,
  User,
  LayoutDashboard,
  BookOpen,
  CheckSquare,
  Shield,
  BarChart3,
  Home,
  FileText,
  CheckCircle2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type SidebarItem = {
  key: string;
  name: string;
  href?: string;
  icon: LucideIcon;
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
}: SidebarShellProps) {
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
              width={120}
              height={40}
              className="object-contain"
              priority
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
              priority
            />
          </div>
        )}
        <Button variant="ghost" size="icon" onClick={onToggle}>
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      <nav className="p-4 space-y-1 flex-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === activeKey;

          const classes = `w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left ${
            isActive
              ? "bg-[#7A0019] text-white"
              : "text-gray-700 hover:bg-gray-100"
          }`;

          if (useButtons) {
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onItemClick?.(item.key)}
                className={classes}
              >
                <Icon className="h-5 w-5" />
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
              <Icon className="h-5 w-5" />
              {open && <span className="font-medium">{item.name}</span>}
            </Link>
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

export type StudentVoterNavKey =
  | "dashboard"
  | "onboarding"
  | "vote"
  | "privacy"
  | "results";

const studentVoterItems: SidebarItem[] = [
  { key: "dashboard", name: "Dashboard", href: "/studentvoter", icon: LayoutDashboard },
  { key: "onboarding", name: "Onboarding", href: "#", icon: BookOpen },
  { key: "vote", name: "Cast Vote", href: "/vote", icon: CheckSquare },
  { key: "privacy", name: "Privacy Statement", href: "#", icon: Shield },
  { key: "results", name: "Election Results", href: "/results", icon: BarChart3 },
];

export function StudentVoterSidebar(props: {
  open: boolean;
  onToggle: () => void;
  active: StudentVoterNavKey;
  userName: string;
  onLogout: () => void;
  fixed?: boolean;
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
    />
  );
}

export type ValidatorNavKey =
  | "overview"
  | "candidates"
  | "results"
  | "audit"
  | "integrity";

const validatorItems: SidebarItem[] = [
  { key: "overview", name: "Dashboard", icon: LayoutDashboard },
  { key: "candidates", name: "Candidates", icon: FileText },
  { key: "results", name: "Results", icon: BarChart3 },
  { key: "audit", name: "Audit Logs", icon: Shield },
  { key: "integrity", name: "Integrity Check", icon: CheckCircle2 },
];

export function ValidatorSidebar(props: {
  open: boolean;
  onToggle: () => void;
  active: ValidatorNavKey;
  userName: string;
  onLogout: () => void;
  onSelect: (key: ValidatorNavKey) => void;
  fixed?: boolean;
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
      useButtons
      onItemClick={(key) => props.onSelect(key as ValidatorNavKey)}
    />
  );
}
