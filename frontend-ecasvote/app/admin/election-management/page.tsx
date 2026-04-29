"use client";

import { useEffect, useState } from "react";
import { deleteElection } from "@/lib/ecasvoteApi";
import { notify } from "@/lib/notify";
import { AdminElectionShell } from "./AdminElectionShell";
import { ElectionListCard } from "./ElectionListCard";
import { CreateElectionModal } from "./CreateElectionModal";
import { DeleteElectionDialog } from "./DeleteElectionDialog";
import { loadElectionRows } from "./utils";
import type { ElectionRow } from "./types";

export default function ElectionManagementPage() {
  const currentYear = new Date().getFullYear();
  const defaultAcademicYear = `${currentYear} - ${currentYear + 1}`;
  const [elections, setElections] = useState<ElectionRow[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [electionPendingDelete, setElectionPendingDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [deleteElectionSubmitting, setDeleteElectionSubmitting] = useState(false);
  const [deleteBlockedReason, setDeleteBlockedReason] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newAcademicYear, setNewAcademicYear] = useState(defaultAcademicYear);
  const [newSemester, setNewSemester] = useState("First Semester");
  const [newStartDate, setNewStartDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  // newStatus removed — elections always start as DRAFT

  const refreshElections = async () => {
    try {
      const rows = await loadElectionRows();
      setElections(rows);
    } catch (err) {
      notify.error({ title: `Failed to load elections: ${err}` });
    }
  };

  useEffect(() => {
    void refreshElections();
  }, []);

  const handleDeleteConfirm = async () => {
    if (!electionPendingDelete) return;
    setDeleteElectionSubmitting(true);
    try {
      await deleteElection(electionPendingDelete.id);
      notify.success({ title: "Election deleted" });
      setElectionPendingDelete(null);
      setDeleteBlockedReason(null);
      await refreshElections();
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      // Detect ELECTION_HAS_VOTES from 409 response
      if (msg.includes("ELECTION_HAS_VOTES") || msg.includes("recorded votes")) {
        setDeleteBlockedReason(
          "Votes have been recorded on the blockchain and cannot be removed. Blockchain records are permanent and immutable."
        );
      } else {
        notify.error({
          title: "Failed to delete election",
          description: msg,
        });
      }
    } finally {
      setDeleteElectionSubmitting(false);
    }
  };

  return (
    <AdminElectionShell
      title="Election Management"
      subtitle="Create elections and open an election to edit details, settings, and candidates"
    >
      <div className="mx-auto w-full max-w-[min(100%,1920px)] space-y-6">
        <ElectionListCard
          elections={elections}
          onCreateClick={() => setShowCreateModal(true)}
          onDeleteClick={(e) =>
            setElectionPendingDelete({ id: e.id, title: e.title || e.id })
          }
          editHref={(id) =>
            `/admin/election-management/${encodeURIComponent(id)}/edit`
          }
        />

        <CreateElectionModal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          newTitle={newTitle}
          setNewTitle={setNewTitle}
          newAcademicYear={newAcademicYear}
          setNewAcademicYear={setNewAcademicYear}
          newSemester={newSemester}
          setNewSemester={setNewSemester}
          newStartDate={newStartDate}
          setNewStartDate={setNewStartDate}
          newEndDate={newEndDate}
          setNewEndDate={setNewEndDate}
          onCreated={async () => {
            await refreshElections();
            setShowCreateModal(false);
          }}
        />

        <DeleteElectionDialog
          open={!!electionPendingDelete}
          title={electionPendingDelete?.title ?? ""}
          submitting={deleteElectionSubmitting}
          blockedReason={deleteBlockedReason}
          onCancel={() => { setElectionPendingDelete(null); setDeleteBlockedReason(null); }}
          onConfirm={handleDeleteConfirm}
        />
      </div>
    </AdminElectionShell>
  );
}