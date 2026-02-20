import React from "react";
import AccessibilityPanel from "@/components/accessibility";

interface AdminHeaderProps {
  title: string;
  subtitle?: string;
  sidebarOpen: boolean;
  actions?: React.ReactNode;
}

export default function AdminHeader({ title, subtitle, sidebarOpen, actions }: AdminHeaderProps) {
  return (
    <header
      className={`bg-white border-b border-gray-200 px-6 ${
        subtitle ? "py-2.5" : "py-5"
      } flex items-center justify-between transition-all duration-300 ${
        sidebarOpen ? "ml-64" : "ml-20"
      }`}
    >
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
        {subtitle && <p className="text-xs text-gray-600 mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        {actions && <div className="flex items-center gap-3">{actions}</div>}
        <AccessibilityPanel sizeClass="h-10 w-10" />
      </div>
    </header>
  );
}
