import React from "react";
import AccessibilityPanel from "@/components/accessibility";

interface StudentVoterHeaderProps {
  title: string;
  subtitle?: string;
  sidebarOpen: boolean;
  actions?: React.ReactNode;
}

export default function StudentVoterHeader({ title, subtitle, sidebarOpen, actions }: StudentVoterHeaderProps) {
  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between w-full">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="text-sm text-gray-600 mt-1">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-4">
          {actions && <div className="flex items-center gap-4">{actions}</div>}
          <AccessibilityPanel sizeClass="h-10 w-10" />
        </div>
      </div>
    </header>
  );
}
