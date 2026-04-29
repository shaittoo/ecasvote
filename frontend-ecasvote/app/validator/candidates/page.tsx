"use client";

import { ValidatorSidebar } from "@/components/Sidebar";
import ValidatorHeader from "../components/header";
import { RoleCandidatesPage } from "@/components/candidates/RoleCandidatesPage";
import { CandidatesPositionsPanel } from "@/components/candidates/CandidatesPositionsPanel";

export default function ValidatorCandidatesPage() {
  return (
    <RoleCandidatesPage
      sidebar={({ open, onToggle, pathname, onLogout }) => (
        <ValidatorSidebar
          open={open}
          onToggle={onToggle}
          active="candidates"
          userName="Validator"
          onLogout={onLogout}
          fixed
          pathname={pathname}
        />
      )}
      header={({ sidebarOpen }) => (
        <ValidatorHeader
          title="Candidates"
          subtitle="Official list by position for verification"
          sidebarOpen={sidebarOpen}
        />
      )}
    >
      <CandidatesPositionsPanel />
    </RoleCandidatesPage>
  );
}
