"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createElection as createElectionApi } from "@/lib/ecasvoteApi";
import { notify } from "@/lib/notify";

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
  newStatus: string;
  setNewStatus: (v: string) => void;
  /** Called after successful create with the new election id (e.g. navigate to edit). */
  onCreated?: (electionId: string) => void;
};

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
  newStatus,
  setNewStatus,
  onCreated,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative mx-4 w-full max-w-2xl rounded-lg bg-white p-6">
        <div className="flex items-start justify-between">
          <h3 className="text-2xl font-semibold text-[#7A0019]">
            Create New Election
          </h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            ✕
          </Button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Election Title
            </label>
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Election Title"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Academic Year
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
              Start Date & Time
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
              End Date & Time
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
              Status
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
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="text-white"
            style={{ backgroundColor: "#7A0019" }}
            onClick={async () => {
              const title = newTitle?.trim() || "Untitled Election";
              if (!newStartDate || !newEndDate) {
                notify.error({
                  title: "Missing dates",
                  description: "Please set both Start and End date & time.",
                });
                return;
              }
              const electionId = `election-${new Date().getFullYear()}-${Date.now()}`;
              try {
                await createElectionApi({
                  electionId,
                  name: title,
                  description: `${newAcademicYear} ${newSemester}`,
                  startTime: new Date(newStartDate).toISOString(),
                  endTime: new Date(newEndDate).toISOString(),
                  createdBy: "admin",
                });
                notify.success({
                  title: "Election created",
                  description: "Election created on blockchain and database.",
                });
                onCreated?.(electionId);
                onClose();
                setNewTitle("");
                setNewStartDate("");
                setNewEndDate("");
              } catch (err: unknown) {
                notify.error({
                  title: "Failed to create election",
                  description:
                    err instanceof Error
                      ? err.message
                      : "Check gateway and blockchain.",
                });
              }
            }}
          >
            Create Election
          </Button>
        </div>
      </div>
    </div>
  );
}
