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
  getGatewayBase,
} from "@/lib/ecasvoteApi";
import type { Position } from "@/lib/ecasvoteApi";
import { notify } from "@/lib/notify";
import { AddCandidatesModal } from "./AddCandidatesModal";
import { CANONICAL_BALLOT_POSITIONS } from "./canonicalBallotPositions";
import type { CandidateDraft, CandidateRow } from "./types";

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
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [drafts, setDrafts] = useState<CandidateDraft[]>([emptyDraft()]);

  const loadPositionsForElection = useCallback(async (eid: string) => {
    try {
      const positionsData = await fetchPositions(eid).catch(() => []);
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
      notify.warning({
        title: "Nothing to save",
        description: "Enter a full name and choose a position for at least one row.",
      });
      return;
    }
    try {
      const candidatesToSave = toAdd.map((c) => {
        const pid = c.position.trim();
        const label = CANONICAL_BALLOT_POSITIONS.find((p) => p.id === pid)?.name;
        return {
          positionId: pid || undefined,
          positionName: label,
          name: c.name.trim(),
          party: c.party?.trim() || undefined,
          program: c.program?.trim() || undefined,
          yearLevel: c.yearLevel?.trim() || undefined,
        };
      });
      const response = await createCandidates(electionId, candidatesToSave);

      const savedList = response.candidates ?? [];
      const savedCount = savedList.length;
      const onChain = response.onChainRegistered ?? 0;

      if (savedCount === 0) {
        notify.error({
          title: "No candidates were saved",
          description:
            "Pick a standard position from the list and ensure the name field is filled. If this persists, use Create Election (position seed) or check gateway logs.",
        });
        await loadPositionsForElection(electionId);
        return;
      }

      // Match image uploads to saved rows by name + position (response order may differ)
      const hasMeta = savedList.some((c) => !!c.positionId || !!c.positionName?.trim());
      for (let i = 0; i < toAdd.length; i++) {
        const draft = toAdd[i];
        if (!draft.imageFile) continue;
        const saved = hasMeta
          ? savedList.find(
              (c) =>
                c.name.trim() === draft.name.trim() &&
                (c.positionId === draft.position.trim() ||
                  c.positionName?.trim() ===
                    CANONICAL_BALLOT_POSITIONS.find((p) => p.id === draft.position.trim())?.name)
            )
          : savedCount === toAdd.length
            ? savedList[i]
            : undefined;
        if (!saved?.id) continue;
        try {
          const form = new FormData();
          form.append("image", draft.imageFile);
          await fetch(
            `${getGatewayBase()}/elections/${electionId}/candidates/${saved.id}/image`,
            { method: "POST", body: form }
          );
        } catch (imgErr) {
          console.warn(`Failed to upload image for candidate ${saved.id}:`, imgErr);
        }
      }

      await loadPositionsForElection(electionId);
      setShowAddModal(false);
      setDrafts([emptyDraft()]);

      const chainLine =
        onChain > 0
          ? `${onChain} of ${savedCount} also registered on the blockchain (while election is DRAFT).`
          : savedCount > 0
            ? "Ledger: not updated (only DRAFT elections register candidates on-chain, or the Fabric step failed — see gateway logs). Database save completed."
            : "";

      try {
        const electionData = await fetchElection(electionId);
        if (
          electionData &&
          (electionData.status === "OPEN" || electionData.status === "CLOSED")
        ) {
          notify.success({
            title: `Successfully added ${savedCount} candidate(s)`,
            description: `Saved to the database. Election is ${electionData.status}. ${chainLine}`.trim(),
          });
        } else {
          notify.success({
            title: `Successfully added ${savedCount} candidate(s)`,
            description: `Saved to the database. ${chainLine}`.trim(),
          });
        }
      } catch {
        notify.success({
          title: `Successfully added ${savedCount} candidate(s)`,
          description: `Saved to the database. ${chainLine}`.trim(),
        });
      }
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "Unknown error";
      let description = raw;
      try {
        const parsed = JSON.parse(raw) as { error?: string; hint?: string };
        if (parsed?.error) {
          description = parsed.hint ? `${parsed.error} ${parsed.hint}` : parsed.error;
        }
      } catch {
        /* plain text */
      }
      notify.error({
        title: "Failed to save candidates",
        description,
      });
    }
  };

  const refresh = async () => {
    try {
      const positionsData = await fetchPositions(electionId);
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
        notify.info({
          title: "Candidates refreshed",
          description: "Latest candidates loaded from the database.",
        });
      } else {
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
              <Button
                className="text-white"
                variant="outline"
                style={{ backgroundColor: locked ? "#9CA3AF" : "#7A0019" }}
                disabled={locked}
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
        drafts={drafts}
        onAddRow={addDraftRow}
        onRemoveRow={removeDraftRow}
        onUpdateDraft={updateDraft}
        onSave={() => void saveDrafts()}
      />
    </>
  );
}