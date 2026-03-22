"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ArrowLeft } from "lucide-react";
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
  const [newStatus, setNewStatus] = useState("Draft");
  const [saving, setSaving] = useState(false);

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
        setNewStatus(form.newStatus);
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
          No election with id <code className="rounded bg-muted px-1">{electionId}</code>.
        </p>
        <Link
          href="/admin/election-management"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Back to elections
        </Link>
      </AdminElectionShell>
    );
  }

  return (
    <AdminElectionShell
      title="Edit election"
      subtitle="Update details, settings, and candidates for this election"
    >
      <div className="mx-auto w-full max-w-[min(100%,1920px)] space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/admin/election-management"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "inline-flex items-center gap-2"
            )}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to election list
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Election details &amp; configuration</CardTitle>
            <p className="text-sm text-muted-foreground">
              Core information and schedule. Saving updates the blockchain and database.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Election title
                </label>
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Election title"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Academic year
                </label>
                <select
                  className="w-full rounded border px-3 py-2"
                  value={newAcademicYear}
                  onChange={(e) => setNewAcademicYear(e.target.value)}
                >
                  <option>2025-2026</option>
                  <option>2026-2027</option>
                  <option>2027-2028</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Semester
                </label>
                <select
                  className="w-full rounded border px-3 py-2"
                  value={newSemester}
                  onChange={(e) => setNewSemester(e.target.value)}
                >
                  <option>First Semester</option>
                  <option>Second Semester</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Start date &amp; time
                </label>
                <input
                  type="datetime-local"
                  className="w-full rounded border px-3 py-2"
                  value={newStartDate}
                  onChange={(e) => setNewStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  End date &amp; time
                </label>
                <input
                  type="datetime-local"
                  className="w-full rounded border px-3 py-2"
                  value={newEndDate}
                  onChange={(e) => setNewEndDate(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Status (display)
                </label>
                <select
                  className="w-full rounded border px-3 py-2"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                >
                  <option>Draft</option>
                  <option>Ongoing</option>
                  <option>Closed</option>
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Opening/closing the election may use separate admin actions on the gateway.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                className="text-white"
                style={{ backgroundColor: "#7A0019" }}
                disabled={saving}
                onClick={() => void handleSave()}
              >
                {saving ? "Saving…" : "Save changes"}
              </Button>
              <Link
                href={`/admin/ballot-print?electionId=${encodeURIComponent(electionId)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                Preview ballot
              </Link>
            </div>
          </CardContent>
        </Card>

        <CandidateManagementPanel
          electionId={electionId}
          electionTitle={electionRow.title}
        />
      </div>
    </AdminElectionShell>
  );
}
