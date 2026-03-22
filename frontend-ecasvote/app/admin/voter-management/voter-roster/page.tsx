"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { Search, Upload, Printer } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AdminSidebar } from "@/components/Sidebar";
import AdminHeader from "../../components/header";
import {
  deleteVoter,
  fetchElections,
  fetchElectionVoters,
  importVoters,
  updateVoter,
  type Election,
  type VoterRecord,
} from "@/lib/ecasvoteApi";
import { parseVoterCsv, VOTER_CSV_EXAMPLE_HEADER } from "@/lib/voterCsv";
import { notify } from "@/lib/notify";

function votedInSelectedElection(v: VoterRecord): boolean {
  if (typeof v.hasVotedThisElection === "boolean") return v.hasVotedThisElection;
  return v.hasVoted;
}

export default function VoterRosterPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [voters, setVoters] = useState<VoterRecord[]>([]);
  const [search, setSearch] = useState("");
  const [printElections, setPrintElections] = useState<Election[]>([]);
  const [printElectionId, setPrintElectionId] = useState("");
  const [electionsLoading, setElectionsLoading] = useState(true);
  const [editingVoter, setEditingVoter] = useState<VoterRecord | null>(null);
  const [editForm, setEditForm] = useState({
    studentNumber: "",
    upEmail: "",
    fullName: "",
    college: "",
    department: "",
    program: "",
    yearLevel: 1,
    status: "ENROLLED",
    isEligible: true,
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadVoters = useCallback(async () => {
    if (!printElectionId) {
      setVoters([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchElectionVoters(printElectionId, "eligible");
      setVoters(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      notify.error({
        title: "Could not load roster",
        description: e instanceof Error ? e.message : "Check that the gateway is running.",
      });
      setVoters([]);
    } finally {
      setLoading(false);
    }
  }, [printElectionId]);

  useEffect(() => {
    if (electionsLoading) return;
    loadVoters();
  }, [electionsLoading, loadVoters]);

  useEffect(() => {
    setElectionsLoading(true);
    fetchElections()
      .then((list) => {
        setPrintElections(list);
        if (list.length > 0) {
          setPrintElectionId((prev) =>
            prev && list.some((e) => e.id === prev) ? prev : list[0].id
          );
        } else {
          setPrintElectionId("");
        }
      })
      .catch(() => {
        setPrintElections([]);
        setPrintElectionId("");
      })
      .finally(() => setElectionsLoading(false));
  }, []);

  const rowsPerPage = 15;
  const filteredVoters = useMemo(() => {
    const q = search.toLowerCase();
    return voters.filter((v) =>
      `${v.studentNumber} ${v.fullName} ${v.upEmail} ${v.department} ${v.program}`
        .toLowerCase()
        .includes(q)
    );
  }, [voters, search]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredVoters.length / rowsPerPage)),
    [filteredVoters.length, rowsPerPage]
  );

  const paginatedVoters = useMemo(
    () =>
      filteredVoters.slice(
        (currentPage - 1) * rowsPerPage,
        currentPage * rowsPerPage
      ),
    [filteredVoters, currentPage, rowsPerPage]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, printElectionId]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  function ballotPrintHref(voter: VoterRecord): string {
    const q = new URLSearchParams({
      electionId: printElectionId,
      studentNumber: voter.studentNumber,
      department: voter.department,
      fullName: voter.fullName,
    });
    return `/admin/ballot-print?${q.toString()}`;
  }

  const handleLogout = () => {
    router.push("/login");
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const { rows, skipped } = parseVoterCsv(text);
      const result = await importVoters(rows);

      const parseNote =
        skipped.length > 0
          ? ` ${skipped.length} row(s) skipped while reading the file (e.g. bad year level). First: line ${skipped[0].line} — ${skipped[0].reason}`
          : "";

      if (result.failed > 0) {
        const first = result.errors[0];
        notify.warning({
          title: "Import finished with issues",
          description: `Created ${result.created}, updated ${result.updated}. ${result.failed} row(s) failed on server.${
            first
              ? ` Example: record #${first.index + 1} (${first.studentNumber ?? "?"}) — ${first.message}`
              : ""
          }${parseNote}`,
        });
      } else if (skipped.length > 0) {
        notify.warning({
          title: "Import completed with skipped rows",
          description: `Saved ${result.total} voter(s).${parseNote}`,
        });
      } else {
        notify.success({
          title: "Import successful",
          description: `Created ${result.created}, updated ${result.updated} (${result.total} total).`,
        });
      }
      await loadVoters();
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      let description = raw;
      try {
        const parsed = JSON.parse(raw) as { error?: string };
        if (parsed?.error) description = parsed.error;
      } catch {
        /* plain text */
      }
      const short =
        description.includes("Cannot POST") || description.includes("404")
          ? " The request hit the Next.js app instead of the gateway. Use the default proxy (unset NEXT_PUBLIC_GATEWAY_URL), or set NEXT_PUBLIC_GATEWAY_URL=http://localhost:4000 and run gateway-api on port 4000."
          : " Ensure gateway-api is running on port 4000 (or set GATEWAY_PROXY_URL).";
      notify.error({
        title: "Import failed",
        description: (description.length > 200 ? "Request failed (see console)." : description) + short,
      });
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const exampleRow =
      "2021-00001\tJuan Dela Cruz\tcas.juan@up.edu.ph\tCAS\tBS Computer Science\t4\tElektrons\tEnrolled\t1st\t2025-2026\n";
    const blob = new Blob([`${VOTER_CSV_EXAMPLE_HEADER}\n`, exampleRow], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "voter-roster-template.tsv";
    a.click();
    URL.revokeObjectURL(url);
  };

  function openEdit(voter: VoterRecord) {
    setEditingVoter(voter);
    setEditForm({
      studentNumber: voter.studentNumber,
      upEmail: voter.upEmail,
      fullName: voter.fullName,
      college: voter.college,
      department: voter.department,
      program: voter.program,
      yearLevel: voter.yearLevel,
      status: voter.status,
      isEligible: voter.isEligible,
    });
  }

  async function saveEdit() {
    if (!editingVoter) return;
    setSavingEdit(true);
    try {
      await updateVoter(editingVoter.id, editForm);
      notify.success({ title: "Voter updated", description: `${editForm.fullName} saved.` });
      setEditingVoter(null);
      await loadVoters();
    } catch (e: unknown) {
      notify.error({
        title: "Update failed",
        description: e instanceof Error ? e.message : "Could not save voter.",
      });
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDeleteVoter(voter: VoterRecord) {
    const ok = window.confirm(
      `Remove ${voter.fullName} (${voter.studentNumber}) from the voter roster? This cannot be undone.`
    );
    if (!ok) return;
    try {
      await deleteVoter(voter.id);
      notify.success({ title: "Voter removed", description: voter.studentNumber });
      await loadVoters();
    } catch (e: unknown) {
      notify.error({
        title: "Delete failed",
        description: e instanceof Error ? e.message : "Could not remove voter.",
      });
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AdminSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        active="voter"
        userName="John"
        onLogout={handleLogout}
        fixed
        pathname={pathname}
      />

      <div className="flex-1 flex flex-col">
        <AdminHeader title="Voter Roster" sidebarOpen={sidebarOpen} />

        <main
          className={`flex-1 p-6 overflow-y-auto transition-all duration-300 ${
            sidebarOpen ? "ml-64" : "ml-20"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,text/csv,text/tab-separated-values"
            className="hidden"
            aria-hidden
            onChange={handleFileChange}
          />

          {electionsLoading || loading ? (
            <div className="text-center py-12 text-gray-500">
              {electionsLoading ? "Loading elections…" : "Loading voter roster…"}
            </div>
          ) : (
            <div className="max-w-7xl mx-auto space-y-6">
              <Card>
                <CardHeader className="space-y-4">
                  <CardTitle className="text-lg">Registered Student Voters</CardTitle>

                  {/* One row (wraps on narrow screens): search · election · template · import */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 lg:flex-nowrap">
                    <div className="relative min-h-10 min-w-0 flex-1 basis-[min(100%,20rem)] sm:min-w-[12rem]">
                      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder="Search name, student no., email, department…"
                        className="h-10 w-full pl-9 pr-[5.5rem]"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground tabular-nums">
                        {filteredVoters.length} results
                      </span>
                    </div>

                    <label htmlFor="voter-roster-print-election" className="sr-only">
                      Election
                    </label>
                    <select
                      id="voter-roster-print-election"
                      className="h-10 w-full min-w-0 shrink-0 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-[min(100%,16rem)] sm:max-w-xs"
                      value={printElectionId}
                      disabled={electionsLoading || printElections.length === 0}
                      onChange={(e) => setPrintElectionId(e.target.value)}
                    >
                      {printElections.length === 0 ? (
                        <option value="">No elections</option>
                      ) : (
                        printElections.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name || e.id}
                          </option>
                        ))
                      )}
                    </select>

                    <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 shrink-0 cursor-pointer"
                        onClick={downloadTemplate}
                      >
                        Download template
                      </Button>
                      <Button
                        type="button"
                        className="h-10 shrink-0 bg-green-600 text-white hover:bg-green-700 cursor-pointer"
                        onClick={handleImportClick}
                        disabled={importing}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        {importing ? "Importing…" : "Import roster"}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {/* <p className="px-6 pb-2 text-xs text-muted-foreground">
                  <strong>Comma or tab-separated.</strong> Registrar-style headers are supported, e.g.{" "}
                  <code className="rounded bg-gray-100 px-1 text-[10px] break-all">
                    student_id, full_name, up_mail, college, program, year_level, academic_org, enrollment_status
                  </code>
                  . Extra columns (<code className="rounded bg-gray-100 px-1">semester</code>,{" "}
                  <code className="rounded bg-gray-100 px-1">academic_year</code>) are ignored.{" "}
                  <code className="rounded bg-gray-100 px-1">academic_org</code> → department. Year level:{" "}
                  <code className="rounded bg-gray-100 px-1">4</code> or <code className="rounded bg-gray-100 px-1">3rd Year</code>.
                </p> */}

                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b text-sm text-gray-600">
                          <th className="text-left py-2">Student Number</th>
                          <th className="text-left py-2">Student Name</th>
                          <th className="text-left py-2">Department</th>
                          <th className="text-left py-2">Degree Program</th>
                          <th className="text-left py-2">Year Level</th>
                          <th className="text-left py-2">Status</th>
                          <th className="text-left py-2">Action</th>
                        </tr>
                      </thead>

                      <tbody>
                        {filteredVoters.length === 0 ? (
                          <tr>
                            <td
                              colSpan={7}
                              className="text-center py-10 text-gray-500"
                            >
                              {!printElectionId
                                ? "Create an election or wait for elections to load."
                                : "No student voters on this election’s list yet. Import students into the registry, then ensure they are assigned to this election in the gateway."}
                            </td>
                          </tr>
                        ) : (
                          paginatedVoters.map((voter) => (
                            <tr
                              key={voter.id}
                              className="border-b text-sm hover:bg-gray-50"
                            >
                              <td className="py-2">{voter.studentNumber}</td>
                              <td className="py-2">{voter.fullName}</td>
                              <td className="py-2">{voter.department}</td>
                              <td className="py-2">{voter.program}</td>
                              <td className="py-2 pl-7">{voter.yearLevel}</td>
                              <td className="py-2">
                                <span
                                  className={`px-2 py-1 rounded text-xs font-medium ${
                                    votedInSelectedElection(voter)
                                      ? "bg-green-100 text-green-700"
                                      : "bg-gray-100 text-gray-600"
                                  }`}
                                >
                                  {votedInSelectedElection(voter) ? "Voted" : "Not Voted"}
                                </span>
                              </td>
                              <td className="py-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {!votedInSelectedElection(voter) ? (
                                    <Link
                                      href={ballotPrintHref(voter)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={cn(
                                        buttonVariants({ variant: "outline", size: "sm" }),
                                        "border-[#7A0019] text-[#7A0019] hover:bg-[#7A0019]/10"
                                      )}
                                    >
                                      <Printer className="w-3.5 h-3.5" />
                                      Print ballot
                                    </Link>
                                  ) : null}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    type="button"
                                    className="cursor-pointer"
                                    onClick={() => openEdit(voter)}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    type="button"
                                    className="text-red-700 hover:bg-red-50 hover:text-red-800 cursor-pointer"
                                    onClick={() => handleDeleteVoter(voter)}
                                  >
                                    Delete
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {filteredVoters.length > 0 && (
                    <div className="flex justify-center mt-4 gap-2 text-sm text-gray-600">
                      <button
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage((p) => p - 1)}
                        className="px-2 py-1 border rounded disabled:opacity-50"
                      >
                        Prev
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => (
                        <button
                          key={i}
                          className={`px-2 py-1 border rounded ${currentPage === i + 1 ? "bg-gray-200" : ""}`}
                          onClick={() => setCurrentPage(i + 1)}
                        >
                          {i + 1}
                        </button>
                      ))}
                      <button
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage((p) => p + 1)}
                        className="px-2 py-1 border rounded disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {editingVoter ? (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-voter-title"
            >
              <div
                className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-gray-200 bg-white p-6 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between">
                  <h3
                    id="edit-voter-title"
                    className="text-lg font-semibold text-[#7A0019]"
                  >
                    Edit voter
                  </h3>
                  <button className="text-gray-600 hover:text-gray-900 text-xl font-bold cursor-pointer" 
                    onClick={() => setEditingVoter(null)}>
                      ✕
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Voter ID {editingVoter.id}
                  {votedInSelectedElection(editingVoter) ? (
                    <span className="ml-2 font-medium text-amber-700">
                      (has voted — student no. / email change carefully)
                    </span>
                  ) : null}
                </p>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-gray-700">Student number</label>
                    <Input
                      className="mt-0.5 h-9"
                      value={editForm.studentNumber}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, studentNumber: e.target.value }))
                      }
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-gray-700">UP Mail</label>
                    <Input
                      className="mt-0.5 h-9"
                      type="email"
                      value={editForm.upEmail}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, upEmail: e.target.value }))
                      }
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-gray-700">Full name</label>
                    <Input
                      className="mt-0.5 h-9"
                      value={editForm.fullName}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, fullName: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700">College</label>
                    <Input
                      className="mt-0.5 h-9"
                      value={editForm.college}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, college: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700">Department / org</label>
                    <Input
                      className="mt-0.5 h-9"
                      value={editForm.department}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, department: e.target.value }))
                      }
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-gray-700">Program</label>
                    <Input
                      className="mt-0.5 h-9"
                      value={editForm.program}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, program: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700">Year level</label>
                    <Input
                      className="mt-0.5 h-9"
                      type="number"
                      min={1}
                      max={20}
                      value={editForm.yearLevel}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          yearLevel: parseInt(e.target.value, 10) || 1,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700">Enrollment status</label>
                    <Input
                      className="mt-0.5 h-9"
                      value={editForm.status}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, status: e.target.value }))
                      }
                    />
                  </div>
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <input
                      id="edit-eligible"
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300"
                      checked={editForm.isEligible}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, isEligible: e.target.checked }))
                      }
                    />
                    <label htmlFor="edit-eligible" className="text-sm text-gray-700">
                      Eligible to vote
                    </label>
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-2 border-t border-gray-100 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditingVoter(null)}
                    disabled={savingEdit}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className="bg-[#7A0019] text-white hover:bg-[#7A0019]/90"
                    onClick={() => void saveEdit()}
                    disabled={savingEdit}
                  >
                    {savingEdit ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
