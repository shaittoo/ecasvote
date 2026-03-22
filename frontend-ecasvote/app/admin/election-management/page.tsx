"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteElection } from "@/lib/ecasvoteApi";
import { notify } from "@/lib/notify";
import { AdminElectionShell } from "./AdminElectionShell";
import { ElectionListCard } from "./ElectionListCard";
import { CreateElectionModal } from "./CreateElectionModal";
import { DeleteElectionDialog } from "./DeleteElectionDialog";
import { loadElectionRows } from "./utils";
import type { ElectionRow } from "./types";

export default function ElectionManagementPage() {
  const router = useRouter();
  const [elections, setElections] = useState<ElectionRow[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [electionPendingDelete, setElectionPendingDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [deleteElectionSubmitting, setDeleteElectionSubmitting] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newAcademicYear, setNewAcademicYear] = useState("2025-2026");
  const [newSemester, setNewSemester] = useState("First Semester");
  const [newStartDate, setNewStartDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  const [newStatus, setNewStatus] = useState("Draft");

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
          editHref={(id) => `/admin/election-management/${encodeURIComponent(id)}/edit`}
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
          newStatus={newStatus}
          setNewStatus={setNewStatus}
          onCreated={async (electionId) => {
            await refreshElections();
            router.push(`/admin/election-management/${encodeURIComponent(electionId)}/edit`);
          }}
        />

        <DeleteElectionDialog
          open={!!electionPendingDelete}
          title={electionPendingDelete?.title ?? ""}
          submitting={deleteElectionSubmitting}
          onCancel={() => !deleteElectionSubmitting && setElectionPendingDelete(null)}
          onConfirm={async () => {
            const pending = electionPendingDelete;
            if (!pending) return;
            setDeleteElectionSubmitting(true);
            try {
              await deleteElection(pending.id);
              notify.success({
                title: "Election deleted",
                description: `"${pending.title}" was removed.`,
              });
              setElectionPendingDelete(null);
              await refreshElections();
            } catch (err: unknown) {
              notify.error({
                title: "Could not delete election",
                description: err instanceof Error ? err.message : String(err),
              });
            } finally {
              setDeleteElectionSubmitting(false);
            }
          }}
        />
      </div>
    </AdminElectionShell>
  );
}
