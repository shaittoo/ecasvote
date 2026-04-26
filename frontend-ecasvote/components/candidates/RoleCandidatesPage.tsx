"use client";

import { useRef, useState, type ReactNode, type UIEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export type RoleCandidatesPageSlotContext = {
  open: boolean;
  onToggle: () => void;
  pathname: string;
  onLogout: () => void;
};

export type RoleCandidatesPageProps = {
  sidebar: (ctx: RoleCandidatesPageSlotContext) => ReactNode;
  header: (ctx: { sidebarOpen: boolean }) => ReactNode;
  children: ReactNode;
};

export function RoleCandidatesPage({ sidebar, header, children }: RoleCandidatesPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);

  const onLogout = () => router.push("/login");
  const onToggle = () => setSidebarOpen((prev) => !prev);
  const onMainScroll = (event: UIEvent<HTMLElement>) => {
    setShowBackToTop(event.currentTarget.scrollTop > 500);
  };
  const scrollToTop = () => {
    mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const marginClass = sidebarOpen ? "ml-64" : "ml-20";

  return (
    <div className="flex min-h-screen bg-muted/40">
      {sidebar({
        open: sidebarOpen,
        onToggle,
        pathname,
        onLogout,
      })}

      <div className="flex flex-1 flex-col">
        {header({ sidebarOpen })}

        <main
          ref={mainRef}
          onScroll={onMainScroll}
          className={`flex-1 overflow-y-auto p-4 transition-all duration-300 sm:p-6 ${marginClass}`}
        >
          {children}
        </main>
      </div>

      {showBackToTop ? (
        <Button
          type="button"
          size="icon"
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-30 rounded-full shadow-lg"
          aria-label="Back to top"
        >
          <ChevronUp className="h-5 w-5" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
