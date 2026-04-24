"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Lock } from "lucide-react";
import { fetchElection, updateElection } from "@/lib/ecasvoteApi";
import { notify } from "@/lib/notify";
import { AdminElectionShell } from "./AdminElectionShell";
import { CandidateManagementPanel } from "./CandidateManagementPanel";
import { loadElectionEditFormState } from "./electionEditHelpers";
import { loadElectionRows } from "./utils";
import type { ElectionRow } from "./types";

export function EditElectionPage() {
  const params = useParams();
  const electionId = typeof params?.electionId === "string" ? params.electionId : "";

  const [loading, setLoading] = useState(true);
  const [electionRow, setElectionRow] = useState<ElectionRow | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newAcademicYear, setNewAcademicYear] = useState("2025-2026");
  const [newSemester, setNewSemester] = useState("First Semester");
  const [newStartDate, setNewStartDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  const [saving, setSaving] = useState(false);

  // Derived from electionRow.status — the status already reflects the chain state
  // because loadElectionRows() calls fetchElection() which triggers auto-open/close.
  const electionStatus = electionRow?.status?.toUpperCase() ?? "DRAFT";
  const locked = electionStatus === "OPEN" || electionStatus === "CLOSED";

  useEffect(() => {
    if (!electionId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await loadElectionRows();
        const row = rows.find((r) => r.id === electionId);
        if (cancelled) return;
        if (!row) {
          setElectionRow(null);
          setLoading(false);
          return;
        }
        setElectionRow(row);
        const form = await loadElectionEditFormState(row);
        if (cancelled) return;
        setNewTitle(form.newTitle);
        setNewAcademicYear(form.newAcademicYear);
        setNewSemester(form.newSemester);
        setNewStartDate(form.newStartDate);
        setNewEndDate(form.newEndDate);
        // NOTE: newStatus removed — status is derived, not editable
      } catch (e) {
        notify.error({ title: `Failed to load election: ${e}` });
        setElectionRow(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [electionId]);

  const handleSave = async () => {
    if (!electionId || !electionRow) return;

    // Double-check lock on the client side before calling the API
    if (locked) {
      notify.error({
        title: "Election is locked",
        description: "Election already started and is locked.",
      });
      return;
    }

    if (!newTitle || !newStartDate || !newEndDate) {
      notify.error({
        title: "Missing fields",
        description: "Title, start, and end date & time are required.",
      });
      return;
    }

    setSaving(true);
    try {
      const startTime = new Date(newStartDate).toISOString();
      const endTime = new Date(newEndDate).toISOString();
      await updateElection(electionId, {
        name: newTitle,
        description: `${newAcademicYear} - ${newSemester}`,
        startTime,
        endTime,
      });
      const electionData = await fetchElection(electionId);
      if (electionData) {
        setElectionRow({
          ...electionRow,
          title: electionData.name || newTitle,
          academicYear: newAcademicYear,
          semester: newSemester,
          status: electionData.status || electionRow.status,
          startEnd: `${new Date(electionData.startTime).toLocaleString("en-US", { timeZone: "Asia/Manila" })} - ${new Date(electionData.endTime).toLocaleString("en-US", { timeZone: "Asia/Manila" })}`,
        });
      }
      notify.success({
        title: "Election updated",
        description: "Changes saved to blockchain and database.",
      });
    } catch (err: unknown) {
      notify.error({
        title: "Update failed",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  if (!electionId) {
    return (
      <AdminElectionShell title="Edit election" subtitle="Invalid link">
        <p className="text-muted-foreground">Missing election id.</p>
      </AdminElectionShell>
    );
  }

  if (loading) {
    return (
      <AdminElectionShell
        title="Edit election"
        subtitle="Loading election details and candidate tools"
      >
        <p className="text-muted-foreground">Loading…</p>
      </AdminElectionShell>
    );
  }

  if (!electionRow) {
    return (
      <AdminElectionShell title="Edit election" subtitle="Election not found">
        <p className="mb-4 text-muted-foreground">
          No election with id{" "}
          <code className="rounded bg-muted px-1">{electionId}</code>.
        </p>
        <Link
          href="/admin/election-management"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to elections
        </Link>
      </AdminElectionShell>
    );
  }

  return (
    <AdminElectionShell
      title="Edit election"
      subtitle={electionRow.title || electionId}
    >
      <div className="mx-auto w-full max-w-[min(100%,1920px)] space-y-6">
        <div className="flex items-center gap-2">
          <Link
            href="/admin/election-management"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </div>

        {/* Election Settings Card */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-2xl">Election Settings</CardTitle>
              {/* Status badge */}
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
                  electionStatus === "OPEN"
                    ? "bg-green-100 text-green-800"
                    : electionStatus === "CLOSED"
                    ? "bg-red-100 text-red-800"
                    : "bg-gray-100 text-gray-700"
                )}
              >
                {locked && <Lock className="h-3 w-3" />}
                {electionStatus}
              </span>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Lock banner */}
            {locked && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Election already started and is locked. All fields are read-only.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Election Title */}
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Election Title
                </label>
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Election Title"
                  disabled={locked}
                  className={locked ? "bg-gray-100 cursor-not-allowed text-gray-500" : ""}
                />
              </div>

              {/* Academic Year */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Academic Year
                </label>
                <Input
                  value={newAcademicYear}
                  onChange={(e) => setNewAcademicYear(e.target.value)}
                  placeholder="2025-2026"
                  disabled={locked}
                  className={locked ? "bg-gray-100 cursor-not-allowed text-gray-500" : ""}
                />
              </div>

              {/* Semester */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Semester
                </label>
                <select
                  className={cn(
                    "w-full rounded border px-2 py-2 text-sm",
                    locked
                      ? "bg-gray-100 cursor-not-allowed text-gray-500 border-gray-200"
                      : "border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#7A0019]/40"
                  )}
                  value={newSemester}
                  onChange={(e) => setNewSemester(e.target.value)}
                  disabled={locked}
                >
                  <option>First Semester</option>
                  <option>Second Semester</option>
                  <option>Summer</option>
                </select>
              </div>

              {/* Start Date */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Start Date &amp; Time (Philippine Time)
                </label>
                <Input
                  type="datetime-local"
                  value={newStartDate}
                  onChange={(e) => setNewStartDate(e.target.value)}
                  disabled={locked}
                  className={locked ? "bg-gray-100 cursor-not-allowed text-gray-500" : ""}
                />
              </div>

              {/* End Date */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  End Date &amp; Time (Philippine Time)
                </label>
                <Input
                  type="datetime-local"
                  value={newEndDate}
                  onChange={(e) => setNewEndDate(e.target.value)}
                  disabled={locked}
                  className={locked ? "bg-gray-100 cursor-not-allowed text-gray-500" : ""}
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                className="text-white"
                style={{ backgroundColor: locked ? "#9CA3AF" : "#7A0019" }}
                onClick={() => void handleSave()}
                disabled={saving || locked}
                title={locked ? "Election is locked and cannot be edited" : undefined}
              >
                {saving ? "Saving…" : locked ? "Locked" : "Save Changes"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Candidate Management */}
        <CandidateManagementPanel
          electionId={electionId}
          electionTitle={electionRow.title}
          locked={locked}
        />
      </div>
    </AdminElectionShell>
  );
}