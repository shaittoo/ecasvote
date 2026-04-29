"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { createElection as createElectionApi } from "@/lib/ecasvoteApi";
import { notify } from "@/lib/notify";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { ElectionSettingsForm } from "./ElectionSettingsForm";
import { validateElectionForm } from "./electionFormValidation";

type Props = {
  open: boolean;
  onClose: () => void;
  newTitle: string;
  setNewTitle: (v: string) => void;
  newAcademicYear: string;
  setNewAcademicYear: (v: string) => void;
  newSemester: string;
  setNewSemester: (v: string) => void;
  newStartDate: string;
  setNewStartDate: (v: string) => void;
  newEndDate: string;
  setNewEndDate: (v: string) => void;
  // newStatus removed — elections always start as DRAFT
  /** Called after successful create with the new election id. */
  onCreated?: (electionId: string) => void;
};

function formatAcademicYear(startYear: number): string {
  return `${startYear} - ${startYear + 1}`;
}

function parseDateTimeLocal(value: string): { date: string; time: string } {
  if (!value) return { date: "", time: "" };
  return {
    date: value.slice(0, 10),
    time: value.slice(11, 16),
  };
}

export function CreateElectionModal({
  open,
  onClose,
  newTitle,
  setNewTitle,
  newAcademicYear,
  setNewAcademicYear,
  newSemester,
  setNewSemester,
  newStartDate,
  setNewStartDate,
  newEndDate,
  setNewEndDate,
  onCreated,
}: Props) {
  const currentYear = new Date().getFullYear();
  const generatedAcademicYears = useMemo(
    () => Array.from({ length: 8 }, (_, index) => formatAcademicYear(currentYear - 1 + index)),
    [currentYear]
  );
  const [durationRange, setDurationRange] = useState<DateRange | undefined>();
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("17:00");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    const startParsed = parseDateTimeLocal(newStartDate);
    const endParsed = parseDateTimeLocal(newEndDate);
    setDurationRange({
      from: startParsed.date ? new Date(`${startParsed.date}T00:00:00`) : undefined,
      to: endParsed.date ? new Date(`${endParsed.date}T00:00:00`) : undefined,
    });
    setStartTime(startParsed.time || "08:00");
    setEndTime(endParsed.time || "17:00");
  }, [newEndDate, newStartDate, open]);

  if (!open) return null;

  const handleCreate = async () => {
    if (creating) return;

    const validation = validateElectionForm({
      title: newTitle,
      academicYear: newAcademicYear,
      semester: newSemester,
      durationRange,
      startTime,
      endTime,
      mode: "create",
    });
    if (!validation.ok) {
      notify.error({
        title: validation.title,
        description: validation.description,
      });
      return;
    }

    try {
      setCreating(true);
      const selectedRange = durationRange;
      if (!selectedRange?.from || !selectedRange?.to) {
        notify.error({
          title: "Missing fields",
          description: "Title, election date range, and start/end times are required.",
        });
        return;
      }
      const startDatePart = format(selectedRange.from, "yyyy-MM-dd");
      const endDatePart = format(selectedRange.to, "yyyy-MM-dd");
      setNewStartDate(`${startDatePart}T${startTime}`);
      setNewEndDate(`${endDatePart}T${endTime}`);
      const result = await createElectionApi({
        electionId: newTitle.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        name: newTitle,
        description: `${newAcademicYear} - ${newSemester}`,
        startTime: validation.startTimeIso,
        endTime: validation.endTimeIso,
      });
      notify.success({ title: "Election created!" });
      onClose();
      if (result?.id) onCreated?.(result.id);
    } catch (err: unknown) {
      notify.error({
        title: "Failed to create election",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => {
          if (!creating) onClose();
        }}
      />
      <div className="relative mx-4 w-full max-w-2xl rounded-lg bg-white p-6">
        <div className="flex items-start justify-between">
          <h3 className="text-2xl font-semibold text-[#7A0019]">
            Create New Election
          </h3>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={creating}>
            ✕
          </Button>
        </div>

        <p className="mt-1 text-sm text-gray-500">
          New elections start as <span className="font-medium">DRAFT</span> and open
          automatically when the start time is reached.
        </p>

        <div className="mt-4">
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
            academicYearOptions={generatedAcademicYears}
            disabled={creating}
            showRequiredIndicators
          />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={creating}>
            Cancel
          </Button>
          <Button
            className="text-white"
            style={{ backgroundColor: "#7A0019" }}
            onClick={() => void handleCreate()}
            disabled={creating}
          >
            {creating ? "Creating..." : "Create Election"}
          </Button>
        </div>
      </div>
    </div>
  );
}