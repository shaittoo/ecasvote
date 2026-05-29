"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckCircle2, Plus, Edit2, Trash2, Printer } from "lucide-react";
import {
  fetchElection,
  fetchPositions,
  createCandidates,
  createPositions,
  publishCandidates,
  getGatewayBase,
} from "@/lib/ecasvoteApi";
import type { Position } from "@/lib/ecasvoteApi";
import { notify } from "@/lib/notify";
import { AddCandidatesModal } from "./AddCandidatesModal";
import type { CandidateDraft, CandidateRow } from "./types";

const STANDARD_POSITIONS = [
  "USC Councilor",
  "CAS Rep. to the USC",
  "CAS Chairperson",
  "CAS Vice Chairperson",
  "CAS Councilor",
  "Clovers Governor",
  "Elektrons Governor",
  "Redbolts Governor",
  "Skimmers Governor",
];

const emptyDraft = (): CandidateDraft => ({
  position: "",
  name: "",
  party: "",
  program: "",
  yearLevel: "",
  imageFile: null,
  imagePreview: "",
});

type Props = {
  electionId: string;
  electionTitle?: string;
  locked?: boolean; // true when election is OPEN or CLOSED
};

export function CandidateManagementPanel({ electionId, electionTitle, locked = false }: Props) {
  const [ballotPositions, setBallotPositions] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [drafts, setDrafts] = useState<CandidateDraft[]>([emptyDraft()]);
  const [candidatesPublished, setCandidatesPublished] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);

  const loadPositionsForElection = useCallback(async (eid: string) => {
    try {
      const positionsData = await fetchPositions(eid).catch(() => []);
      setBallotPositions(STANDARD_POSITIONS);  
      
      if (positionsData?.length) {
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
        setCandidates([]);
      }
    } catch (err) {
      notify.error({ title: `Failed to load positions: ${err}` });
    }
  }, []);

  useEffect(() => {
    if (!electionId) return;
    loadPositionsForElection(electionId);
    // Load candidatesPublished status
    fetchElection(electionId)
      .then((e) => { if (e) setCandidatesPublished(!!e.candidatesPublished); })
      .catch(() => {});
  }, [electionId, loadPositionsForElection]);

  const addDraftRow = () => setDrafts((prev) => [...prev, emptyDraft()]);

  const removeDraftRow = (index: number) => {
    setDrafts((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length ? next : [emptyDraft()];
    });
  };

  const updateDraft = (
    index: number,
    field: keyof CandidateDraft,
    value: string | File | null
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
      // Ensure positions exist in the database before adding candidates
      // const uniquePositionNames = [...new Set(toAdd.map((c) => c.position.trim()))];
      // await createPositions(
      //   electionId,
      //   uniquePositionNames.map((name, i) => ({ name, maxVotes: 1, order: i + 1 }))
      // );

      const candidatesToSave = toAdd.map((c) => ({
        positionName: c.position,
        name: c.name,
        party: c.party || undefined,
        program: c.program || undefined,
        yearLevel: c.yearLevel || undefined,
      }));
      const response = await createCandidates(electionId, candidatesToSave);

      if (!response.count) {
        notify.warning({
          title: "No candidates were saved",
          description:
            "Each row needs a position that already exists for this election, with the name matching exactly (check spelling and spacing).",
        });
        await loadPositionsForElection(electionId);
        return;
      }

      // Upload images for candidates that have one
      if (response.candidates && response.candidates.length > 0) {
        for (let i = 0; i < toAdd.length; i++) {
          const draft = toAdd[i];
          const saved = response.candidates[i];
          if (draft.imageFile && saved?.id) {
            try {
              const form = new FormData();
              form.append("image", draft.imageFile);
              await fetch(
                `${getGatewayBase()}/elections/${electionId}/candidates/${saved.id}/image`,
                { method: "POST", body: form }
              );
            } catch (imgErr) {
              console.warn(`Failed to upload image for candidate ${saved.id}:`, imgErr);
              // Non-fatal: candidate is saved, image just won't show
            }
          }
        }
      }

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

  const confirmPublishCandidates = async () => {
    if (!electionId) return;
    setPublishing(true);
    try {
      await publishCandidates(electionId);
      setCandidatesPublished(true);
      setShowPublishModal(false);
      notify.success({ title: "Candidates published successfully" });
    } catch (err) {
      notify.error({
        title: "Failed to publish candidates",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setPublishing(false);
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
                  Election:{" "}
                  <span className="font-medium text-foreground">{electionTitle}</span>
                </p>
              ) : null}
            </div>
          </div>

          {locked && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
              Election is locked — candidates cannot be added, edited, or deleted.
            </div>
          )}

          <div className="flex w-full flex-col flex-wrap items-stretch justify-between gap-3 lg:flex-row lg:items-end">
            <div className="flex flex-wrap gap-2">
              <Button
                className="text-white"
                style={{ backgroundColor: locked ? "#9CA3AF" : "#7A0019" }}
                disabled={locked}
                onClick={() => !locked && setShowAddModal(true)}
                title={locked ? "Election is locked" : undefined}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add New Candidate
              </Button>
              {candidatesPublished ? (
                <Button variant="outline" disabled className="text-green-700 border-green-300 bg-green-50">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Candidates Published
                </Button>
              ) : candidates.length > 0 ? (
                <Button
                  className="text-white bg-[#0C8C3F] hover:bg-[#0a7a36]"
                  onClick={() => setShowPublishModal(true)}
                  disabled={publishing}
                >
                  {publishing ? "Publishing..." : "Publish Candidates"}
                </Button>
              ) : null}
              {/* <Link
                href={`/admin/ballot-print?electionId=${encodeURIComponent(electionId)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                <Printer className="mr-2 h-4 w-4" />
                Preview Ballot
              </Link> */}
              {/* <Button
                className="text-white"
                style={{ backgroundColor: "#0C8C3F" }}
                onClick={() => void refresh()}
              >
                Refresh
              </Button> */}
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
                            className="text-gray-400"
                            type="button"
                            disabled
                            title="Edit candidate (coming soon)"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={locked ? "text-gray-300 cursor-not-allowed" : "text-red-600"}
                            type="button"
                            disabled={locked}
                            title={locked ? "Election is locked" : "Delete candidate"}
                            onClick={() => {
                              if (!locked) {
                                setCandidates((prev) =>
                                  prev.filter((_, i) => i !== index)
                                );
                              }
                            }}
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
        locked={locked}
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

      {/* Publish candidates confirmation modal */}
      {showPublishModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => !publishing && setShowPublishModal(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Publish Candidates
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              Publish candidate list for{" "}
              <span className="font-medium text-gray-900">{electionTitle || electionId}</span>?
              Candidates will be visible to students and validators.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                className="bg-white"
                onClick={() => setShowPublishModal(false)}
                disabled={publishing}
              >
                Cancel
              </Button>
              <Button
                className="text-white"
                style={{ backgroundColor: "#7A0019" }}
                onClick={confirmPublishCandidates}
                disabled={publishing}
              >
                {publishing ? "Publishing..." : "Publish Candidates"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}