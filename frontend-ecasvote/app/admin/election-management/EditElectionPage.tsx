"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft, Lock } from "lucide-react";
import { fetchElection, updateElection } from "@/lib/ecasvoteApi";
import { notify } from "@/lib/notify";
import { AdminElectionShell } from "./AdminElectionShell";
import { CandidateManagementPanel } from "./CandidateManagementPanel";
import { loadElectionEditFormState } from "./electionEditHelpers";
import { loadElectionRows } from "./utils";
import type { ElectionRow } from "./types";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { ElectionSettingsForm } from "./ElectionSettingsForm";
import { validateElectionForm } from "./electionFormValidation";

function formatAcademicYear(startYear: number): string {
  return `${startYear} - ${startYear + 1}`;
}

function normalizeAcademicYear(value: string): string {
  const match = value.match(/(\d{4})\s*-\s*(\d{4})/);
  if (!match) return value;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return value;
  return `${start} - ${end}`;
}

type EditFormSnapshot = {
  title: string;
  academicYear: string;
  semester: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
};

export function EditElectionPage() {
  const params = useParams();
  const router = useRouter();
  const electionId = typeof params?.electionId === "string" ? params.electionId : "";
  const currentYear = new Date().getFullYear();
  const defaultAcademicYear = formatAcademicYear(currentYear);
  const generatedAcademicYears = Array.from({ length: 8 }, (_, index) =>
    formatAcademicYear(currentYear - 1 + index)
  );

  const [loading, setLoading] = useState(true);
  const [electionRow, setElectionRow] = useState<ElectionRow | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newAcademicYear, setNewAcademicYear] = useState(defaultAcademicYear);
  const [newSemester, setNewSemester] = useState("First Semester");
  const [durationRange, setDurationRange] = useState<DateRange | undefined>();
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("17:00");
  const [saving, setSaving] = useState(false);
  const initialSnapshotRef = useRef<EditFormSnapshot | null>(null);

  // Derived from electionRow.status — the status already reflects the chain state
  // because loadElectionRows() calls fetchElection() which triggers auto-open/close.
  const electionStatus = electionRow?.status?.toUpperCase() ?? "DRAFT";
  // DEBUG: allow editing on open elections
  const locked = false; // was: electionStatus !== "DRAFT"

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
        const normalizedAcademicYear =
          normalizeAcademicYear(form.newAcademicYear) || defaultAcademicYear;
        const initialStartDate = form.newStartDate?.slice(0, 10) || "";
        const initialEndDate = form.newEndDate?.slice(0, 10) || "";
        const initialStartTime = form.newStartDate?.slice(11, 16) || "08:00";
        const initialEndTime = form.newEndDate?.slice(11, 16) || "17:00";
        setNewTitle(form.newTitle);
        setNewAcademicYear(normalizedAcademicYear);
        setNewSemester(form.newSemester);
        setDurationRange({
          from: initialStartDate ? new Date(`${initialStartDate}T00:00:00`) : undefined,
          to: initialEndDate ? new Date(`${initialEndDate}T00:00:00`) : undefined,
        });
        setStartTime(initialStartTime);
        setEndTime(initialEndTime);
        initialSnapshotRef.current = {
          title: form.newTitle,
          academicYear: normalizedAcademicYear,
          semester: form.newSemester,
          startDate: initialStartDate,
          endDate: initialEndDate,
          startTime: initialStartTime,
          endTime: initialEndTime,
        };
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
  }, [defaultAcademicYear, electionId]);

  const handleSave = async () => {
    if (saving) return;
    if (!electionId || !electionRow) return;

    // Double-check lock on the client side before calling the API
    if (locked) {
      notify.error({
        title: "Election is locked",
        description: "Election already started and is locked.",
      });
      return;
    }

    const validation = validateElectionForm({
      title: newTitle,
      academicYear: newAcademicYear,
      semester: newSemester,
      durationRange,
      startTime,
      endTime,
      status: electionStatus as "DRAFT" | "OPEN" | "CLOSED",
    });
    if (!validation.ok) {
      notify.error({
        title: validation.title,
        description: validation.description,
      });
      return;
    }
    const selectedRange = durationRange;
    if (!selectedRange?.from || !selectedRange?.to) return;
    const startDatePart = format(selectedRange.from, "yyyy-MM-dd");
    const endDatePart = format(selectedRange.to, "yyyy-MM-dd");

    setSaving(true);
    try {
      await updateElection(electionId, {
        name: newTitle,
        description: `${newAcademicYear} - ${newSemester}`,
        startTime: validation.startTimeIso,
        endTime: validation.endTimeIso,
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
      initialSnapshotRef.current = {
        title: newTitle,
        academicYear: newAcademicYear,
        semester: newSemester,
        startDate: startDatePart,
        endDate: endDatePart,
        startTime,
        endTime,
      };
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

  const rangeLabel = !durationRange?.from
    ? "Select election date range"
    : !durationRange.to
    ? format(durationRange.from, "MMM dd, yyyy")
    : `${format(durationRange.from, "MMM dd, yyyy")} - ${format(durationRange.to, "MMM dd, yyyy")}`;
  const academicYearOptions = generatedAcademicYears.includes(newAcademicYear)
    ? generatedAcademicYears
    : [newAcademicYear, ...generatedAcademicYears];
  const currentSnapshot: EditFormSnapshot = {
    title: newTitle,
    academicYear: newAcademicYear,
    semester: newSemester,
    startDate: durationRange?.from ? format(durationRange.from, "yyyy-MM-dd") : "",
    endDate: durationRange?.to ? format(durationRange.to, "yyyy-MM-dd") : "",
    startTime,
    endTime,
  };
  const isDirty = initialSnapshotRef.current
    ? JSON.stringify(initialSnapshotRef.current) !== JSON.stringify(currentSnapshot)
    : false;

  const handleBack = () => {
    if (isDirty) {
      notify.error({
        title: "Unsaved changes",
        description: "Please save drafts first before going back.",
      });
      return;
    }
    router.push("/admin/election-management");
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
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/admin/election-management")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Elections
        </Button>
      </AdminElectionShell>
    );
  }

  return (
    <AdminElectionShell
      title="Edit election"
      subtitle="Update election details, dates, and candidates while still in draft"
    >
      <div className="mx-auto w-full max-w-[min(100%,1920px)] space-y-6">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleBack}
            disabled={saving}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Elections
          </Button>
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
                  Only draft elections can be edited. All fields are read-only.
                </span>
              </div>
            )}

            <ElectionSettingsForm
              title={newTitle}
              onTitleChange={setNewTitle}
              academicYear={newAcademicYear}
              onAcademicYearChange={setNewAcademicYear}
              semester={newSemester}
              onSemesterChange={setNewSemester}
              durationRange={durationRange}
              onDurationRangeChange={setDurationRange}
              startTime={startTime}
              onStartTimeChange={setStartTime}
              endTime={endTime}
              onEndTimeChange={setEndTime}
              academicYearOptions={academicYearOptions}
              disabled={locked}
            />

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