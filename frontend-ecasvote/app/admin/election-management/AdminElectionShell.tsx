"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminSidebar } from "@/components/Sidebar";
import AdminHeader from "../components/header";

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function AdminElectionShell({ title, subtitle, children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userName, setUserName] = useState("Admin");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("admin");
    if (stored) {
      try {
        const p = JSON.parse(stored);
        setUserName(p?.fullName ?? "Admin");
      } catch {
        setUserName("SEB Admin");
      }
    }
  }, []);

  const handleLogout = () => {
    router.push("/login");
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <style jsx global>{`
        button {
          cursor: pointer;
        }
        aside nav a {
          pointer-events: auto !important;
          cursor: pointer !important;
        }
      `}</style>
      <AdminSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((p) => !p)}
        active="election"
        userName={userName}
        onLogout={handleLogout}
        fixed
        pathname={pathname}
      />
      <div className="flex flex-1 flex-col">
        <AdminHeader title={title} subtitle={subtitle} sidebarOpen={sidebarOpen} />
        <main
          className={`flex-1 overflow-y-auto p-6 transition-all duration-300 ${
            sidebarOpen ? "ml-64" : "ml-20"
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
