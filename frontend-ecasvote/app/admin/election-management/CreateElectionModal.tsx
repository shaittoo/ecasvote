"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createElection as createElectionApi, getGatewayBase } from "@/lib/ecasvoteApi";
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
            <Input
              value={newAcademicYear}
              onChange={(e) => setNewAcademicYear(e.target.value)}
              placeholder="2025-2026"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Semester
            </label>
            <select
              className="w-full rounded border border-gray-300 px-2 py-2 text-sm"
              value={newSemester}
              onChange={(e) => setNewSemester(e.target.value)}
            >
              <option>First Semester</option>
              <option>Second Semester</option>
              <option>Summer</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Start Date &amp; Time (Philippine Time)
            </label>
            <Input
              type="datetime-local"
              value={newStartDate}
              onChange={(e) => setNewStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              End Date &amp; Time (Philippine Time)
            </label>
            <Input
              type="datetime-local"
              value={newEndDate}
              onChange={(e) => setNewEndDate(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="text-white"
            style={{ backgroundColor: "#7A0019" }}
            onClick={async () => {
              const title = newTitle.trim();
              if (!title || !newStartDate || !newEndDate) {
                notify.error({
                  title: "Missing fields",
                  description: "Title, start date, and end date are required.",
                });
                return;
              }
              const electionId = `election-${new Date().getFullYear()}-${Date.now()}`;
              try {
                // Step 1: Create election on blockchain + DB
                await createElectionApi({
                  electionId,
                  name: title,
                  description: `${newAcademicYear} ${newSemester}`,
                  startTime: new Date(newStartDate).toISOString(),
                  endTime: new Date(newEndDate).toISOString(),
                  createdBy: "admin",
                });

                // Step 2: Seed the 9 standard CAS SC positions on blockchain + DB
                try {
                  const seedRes = await fetch(
                    `${getGatewayBase()}/elections/${electionId}/positions/seed`,
                    { method: "POST" }
                  );
                  if (!seedRes.ok) {
                    const err = await seedRes.text();
                    console.warn("Positions seed failed (non-fatal):", err);
                    notify.error({
                      title: "Election created but positions failed",
                      description:
                        "The election was created but positions could not be seeded. Check gateway logs.",
                    });
                  } else {
                    notify.success({
                      title: "Election created",
                      description:
                        "Election and all 9 positions added to blockchain and database.",
                    });
                  }
                } catch (seedErr) {
                  console.warn("Positions seed error (non-fatal):", seedErr);
                  notify.error({
                    title: "Election created but positions failed",
                    description:
                      "The election was created but positions could not be seeded. Check gateway logs.",
                  });
                }

                onCreated?.(electionId);
                onClose();
                setNewTitle("");
                setNewAcademicYear("2025-2026");
                setNewSemester("First Semester");
                setNewStartDate("");
                setNewEndDate("");
                setNewStatus("Draft");
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