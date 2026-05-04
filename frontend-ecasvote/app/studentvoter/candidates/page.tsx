"use client";

import { useSearchParams } from "next/navigation";
import { StudentVoterSidebar } from "@/components/Sidebar";
import StudentVoterHeader from "../components/header";
import { RoleCandidatesPage } from "@/components/candidates/RoleCandidatesPage";
import { CandidatesPositionsPanel } from "@/components/candidates/CandidatesPositionsPanel";

export default function StudentVoterCandidatesPage() {
  const searchParams = useSearchParams();
  const electionFromQuery = searchParams.get("election")?.trim() || undefined;

  return (
    <RoleCandidatesPage
      sidebar={({ open, onToggle, pathname, onLogout }) => (
        <StudentVoterSidebar
          open={open}
          onToggle={onToggle}
          active="candidates"
          userName="Student Voter"
          onLogout={onLogout}
          fixed
          pathname={pathname}
        />
      )}
      header={({ sidebarOpen }) => (
        <div
          className={`transition-all duration-300 ${sidebarOpen ? "ml-64" : "ml-20"}`}
        >
          <StudentVoterHeader
            title="Candidates"
            subtitle="Review all candidates and their information"
            sidebarOpen={sidebarOpen}
          />
        </div>
      )}
    >
      <CandidatesPositionsPanel electionId={electionFromQuery} />
    </RoleCandidatesPage>
  );
}
