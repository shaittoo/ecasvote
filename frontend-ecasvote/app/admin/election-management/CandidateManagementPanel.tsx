"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus, Edit2, Trash2, Printer } from "lucide-react";
import {
  fetchElection,
  fetchPositions,
  createCandidates,
} from "@/lib/ecasvoteApi";
import type { Position } from "@/lib/ecasvoteApi";
import { notify } from "@/lib/notify";
import { AddCandidatesModal } from "./AddCandidatesModal";
import type { CandidateDraft, CandidateRow } from "./types";

const emptyDraft = (): CandidateDraft => ({
  position: "",
  name: "",
  party: "",
  program: "",
  yearLevel: "",
});

type Props = {
  electionId: string;
  electionTitle?: string;
};

export function CandidateManagementPanel({ electionId, electionTitle }: Props) {
  const [ballotPositions, setBallotPositions] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [drafts, setDrafts] = useState<CandidateDraft[]>([emptyDraft()]);

  const loadPositionsForElection = useCallback(async (eid: string) => {
    try {
      const positionsData = await fetchPositions(eid).catch(() => []);
      if (positionsData?.length) {
        setBallotPositions(positionsData.map((p: Position) => p.name));
        const rows: CandidateRow[] = [];
        positionsData.forEach((position: Position) => {
          position.candidates?.forEach((candidate) => {
            rows.push({
              id: candidate.id,
              position: position.name,
              name: candidate.name,
              party: candidate.party || "Independent",
              yearLevel: candidate.yearLevel || "",
            });
          });
        });
        setCandidates(rows);
      } else {
        setBallotPositions([]);
        setCandidates([]);
      }
    } catch (err) {
      notify.error({ title: `Failed to load positions: ${err}` });
    }
  }, []);

  useEffect(() => {
    if (!electionId) return;
    loadPositionsForElection(electionId);
  }, [electionId, loadPositionsForElection]);

  const addDraftRow = () =>
    setDrafts((prev) => [...prev, emptyDraft()]);

  const removeDraftRow = (index: number) => {
    setDrafts((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length ? next : [emptyDraft()];
    });
  };

  const updateDraft = (
    index: number,
    field: keyof CandidateDraft,
    value: string
  ) => {
    setDrafts((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  };

  const saveDrafts = async () => {
    const toAdd = drafts.filter(
      (c) => c.name.trim() !== "" && c.position.trim() !== ""
    );
    if (toAdd.length === 0) {
      setShowAddModal(false);
      setDrafts([emptyDraft()]);
      return;
    }
    try {
      const candidatesToSave = toAdd.map((c) => ({
        positionName: c.position,
        name: c.name,
        party: c.party || undefined,
        program: c.program || undefined,
        yearLevel: c.yearLevel || undefined,
      }));
      const response = await createCandidates(electionId, candidatesToSave);
      await loadPositionsForElection(electionId);
      setShowAddModal(false);
      setDrafts([emptyDraft()]);
      try {
        const electionData = await fetchElection(electionId);
        if (
          electionData &&
          (electionData.status === "OPEN" || electionData.status === "CLOSED")
        ) {
          notify.success({
            title: `Successfully added ${response.count} candidate(s) to database!`,
            description: `Candidates were saved to the database. Election is ${electionData.status}.`,
          });
        } else {
          notify.success({
            title: `Successfully added ${response.count} candidate(s)!`,
          });
        }
      } catch {
        notify.success({
          title: `Successfully added ${response.count} candidate(s)!`,
        });
      }
    } catch (err: unknown) {
      notify.error({
        title: "Failed to save candidates",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  const refresh = async () => {
    try {
      const positionsData = await fetchPositions(electionId);
      if (positionsData?.length) {
        setBallotPositions(positionsData.map((p: Position) => p.name));
        const rows: CandidateRow[] = [];
        positionsData.forEach((position: Position) => {
          position.candidates?.forEach((candidate) => {
            rows.push({
              id: candidate.id,
              position: position.name,
              name: candidate.name,
              party: candidate.party || "Independent",
              yearLevel: candidate.yearLevel || "",
            });
          });
        });
        setCandidates(rows);
        notify.info({
          title: "Candidates refreshed",
          description: "Latest candidates loaded from the database.",
        });
      } else {
        setBallotPositions([]);
        setCandidates([]);
        notify.info({
          title: "Candidates refreshed",
          description: "No positions for this election yet.",
        });
      }
    } catch (err: unknown) {
      notify.error({
        title: "Failed to refresh",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Candidate Management</CardTitle>
              {electionTitle ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Election: <span className="font-medium text-foreground">{electionTitle}</span>
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex w-full flex-col flex-wrap items-stretch justify-between gap-3 lg:flex-row lg:items-end">
            <div className="flex flex-wrap gap-2">
              <Button
                className="text-white"
                style={{ backgroundColor: "#7A0019" }}
                onClick={() => setShowAddModal(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add New Candidate
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  notify.info({
                    title: "Draft saved",
                    description:
                      'Draft saved locally. Use "Add Candidates" in the modal to save to the database.',
                  })
                }
              >
                Save Draft
              </Button>
              <Link
                href={`/admin/ballot-print?electionId=${encodeURIComponent(electionId)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                <Printer className="mr-2 h-4 w-4" />
                Preview Ballot
              </Link>
              <Button
                className="text-white"
                style={{ backgroundColor: "#0C8C3F" }}
                onClick={() => void refresh()}
              >
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">
                    Position
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">
                    Candidate Name
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">
                    Party
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {candidates.length > 0 ? (
                  candidates.map((candidate, index) => (
                    <tr
                      key={candidate.id || index}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="px-4 py-4 font-medium text-gray-900">
                        {candidate.position}
                      </td>
                      <td className="px-4 py-4 text-gray-700">{candidate.name}</td>
                      <td className="px-4 py-4 text-gray-700">{candidate.party}</td>
                      <td className="px-4 py-4">
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-gray-600"
                            type="button"
                            disabled
                            title="Edit candidate (coming soon)"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600"
                            type="button"
                            onClick={() =>
                              setCandidates((prev) =>
                                prev.filter((_, i) => i !== index)
                              )
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      No candidates added yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <AddCandidatesModal
        open={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setDrafts([emptyDraft()]);
        }}
        ballotPositions={ballotPositions}
        drafts={drafts}
        onAddRow={addDraftRow}
        onRemoveRow={removeDraftRow}
        onUpdateDraft={updateDraft}
        onSave={() => void saveDrafts()}
      />
    </>
  );
}
