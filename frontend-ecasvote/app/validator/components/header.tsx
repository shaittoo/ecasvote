import React from "react";

interface ValidatorHeaderProps {
  title: string;
  subtitle?: string;
  sidebarOpen: boolean;
  actions?: React.ReactNode;
}

export default function ValidatorHeader({ title, subtitle, sidebarOpen, actions }: ValidatorHeaderProps) {
  return (
    <header className={`bg-white border-b border-gray-200 px-6 py-5 transition-all duration-300 ${
      sidebarOpen ? "ml-64" : "ml-20"
    }`}>
      <div className="flex items-center justify-between w-full">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-4">{actions}</div>}
      </div>
    </header>
  );
}
