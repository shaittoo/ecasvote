"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, RefreshCw, Search } from "lucide-react";
import { AdminSidebar } from "@/components/Sidebar";
import AdminHeader from "../../components/header";
import {
  fetchElections,
  fetchPaperTokens,
  fetchPaperCheckIn,
  issuePaperBallot,
  generateAllPaperTokens,
  type Election,
  type PaperTokenRow,
  type PaperCheckInVoter,
} from "@/lib/ecasvoteApi";
import { notify } from "@/lib/notify";

function formatDt(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function TokenStatusPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [elections, setElections] = useState<Election[]>([]);
  const [electionId, setElectionId] = useState("");
  const [tokens, setTokens] = useState<PaperTokenRow[]>([]);
  const [voters, setVoters] = useState<PaperCheckInVoter[]>([]);
  const [stats, setStats] = useState({
    totalIssued: 0,
    used: 0,
    unused: 0,
  });
  const [searchVoters, setSearchVoters] = useState("");
  const [electionsLoading, setElectionsLoading] = useState(true);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [issuingVoterId, setIssuingVoterId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const rowsPerPage = 15;

  useEffect(() => {
    setElectionsLoading(true);
    fetchElections()
      .then((list) => {
        setElections(list);
        if (list.length > 0) {
          setElectionId((prev) =>
            prev && list.some((e) => e.id === prev) ? prev : list[0].id
          );
        }
      })
      .catch(() => setElections([]))
      .finally(() => setElectionsLoading(false));
  }, []);

  const loadAll = useCallback(async (id: string) => {
    if (!id) {
      setTokens([]);
      setVoters([]);
      setStats({ totalIssued: 0, used: 0, unused: 0 });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [paper, checkIn] = await Promise.all([
        fetchPaperTokens(id),
        fetchPaperCheckIn(id),
      ]);
      setTokens(paper.tokens ?? []);
      setStats(paper.stats ?? { totalIssued: 0, used: 0, unused: 0 });
      setVoters(checkIn.voters ?? []);
    } catch (e: unknown) {
      notify.error({
        title: "Could not load token status",
        description: e instanceof Error ? e.message : "Check that the gateway is running.",
      });
      setTokens([]);
      setVoters([]);
      setStats({ totalIssued: 0, used: 0, unused: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll(electionId);
  }, [electionId, loadAll]);

  /** Join issued-token details (times, cast status) onto voter rows by student number. */
  const tokenByStudent = useMemo(() => {
    const m = new Map<string, PaperTokenRow>();
    for (const t of tokens) {
      m.set(t.studentNumber, t);
    }
    return m;
  }, [tokens]);

  const filteredVoters = useMemo(() => {
    const q = searchVoters.toLowerCase();
    if (!q) return voters;
    return voters.filter((v) => {
      const row = tokenByStudent.get(v.studentNumber);
      const haystack = [
        v.studentNumber,
        v.name,
        v.paperStatus,
        v.ballotToken ?? "",
        row?.ballotToken ?? "",
        row?.status ?? "",
        row?.timeCreated ?? "",
        row?.timeUsed ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [voters, searchVoters, tokenByStudent]);

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
  }, [searchVoters, electionId]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  async function handleGenerateAll() {
    if (!electionId) return;
    setBulkGenerating(true);
    try {
      const result = await generateAllPaperTokens(electionId);
      notify.success({
        title: "Tokens generated",
        description: `Created ${result.created} token(s).`,
      });
      if (result.errorCount > 0) {
        notify.error({
          title: "Some rows failed",
          description: result.errors[0] ?? `${result.errorCount} error(s)`,
        });
      }
      await loadAll(electionId);
    } catch (e: unknown) {
      notify.error({
        title: "Generate failed",
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setBulkGenerating(false);
    }
  }

  async function handleGenerateOne(voterId: number) {
    if (!electionId) return;
    setIssuingVoterId(voterId);
    try {
      const r = await issuePaperBallot(electionId, voterId);
      notify.success({
        title: r.reprint ? "Token (reprint)" : "Token generated",
        description: `${r.studentNumber} → ${r.ballotToken}`,
      });
      await loadAll(electionId);
    } catch (e: unknown) {
      notify.error({
        title: "Could not generate token",
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setIssuingVoterId(null);
    }
  }

  const handleLogout = () => {
    router.push("/login");
  };

  function statusBadge(status: PaperCheckInVoter["paperStatus"]) {
    if (status === "Voted") {
      return (
        <span className="rounded bg-green-50 text-green-800 px-2 py-0.5 text-xs">Voted</span>
      );
    }
    if (status === "Issued") {
      return (
        <span className="rounded bg-blue-50 text-blue-800 px-2 py-0.5 text-xs">Issued</span>
      );
    }
    return (
      <span className="rounded bg-amber-50 text-amber-800 px-2 py-0.5 text-xs">Not issued</span>
    );
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
        <AdminHeader title="Token Status" sidebarOpen={sidebarOpen} />

        <main
          className={`flex-1 p-6 overflow-y-auto transition-all duration-300 ${
            sidebarOpen ? "ml-64" : "ml-20"
          }`}
        >
          {electionsLoading ? (
            <div className="text-center py-12 text-gray-500">Loading elections…</div>
          ) : (
            <div className="max-w-7xl mx-auto space-y-6">
              {!loading && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard
                    title="Total issued"
                    value={stats.totalIssued}
                    color="text-gray-600"
                  />
                  <StatCard
                    title="Tokens used"
                    value={stats.used}
                    color="text-green-700"
                  />
                  <StatCard
                    title="Token unused"
                    value={stats.unused}
                    color="text-amber-700"
                  />
                  <StatCard
                    title="Selected election"
                    valueLabel={
                      electionId
                        ? elections.find((e) => e.id === electionId)?.name || electionId
                        : "—"
                    }
                    color="text-blue-800"
                  />
                </div>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Voter Token Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Toolbar below section title */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 lg:flex-nowrap">
                    <div className="relative min-h-10 min-w-0 flex-1 basis-[min(100%,20rem)] sm:min-w-[12rem]">
                      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search name, student no., token, status…"
                        className="h-10 w-full pl-9 pr-[5.5rem]"
                        value={searchVoters}
                        onChange={(e) => setSearchVoters(e.target.value)}
                        aria-label="Search voters and tokens"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground tabular-nums">
                        {filteredVoters.length} results
                      </span>
                    </div>

                    <label htmlFor="token-status-election" className="sr-only">
                      Election
                    </label>
                    <select
                      id="token-status-election"
                      className="h-10 w-full min-w-0 shrink-0 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-[min(100%,16rem)] sm:max-w-xs"
                      value={electionId}
                      disabled={electionsLoading || elections.length === 0}
                      onChange={(e) => setElectionId(e.target.value)}
                    >
                      {electionsLoading ? (
                        <option value="">Loading elections…</option>
                      ) : elections.length === 0 ? (
                        <option value="">No elections</option>
                      ) : (
                        elections.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name || e.id}
                          </option>
                        ))
                      )}
                    </select>

                    <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                      <Button
                        type="button"
                        className="h-10 shrink-0 inline-flex items-center gap-1.5 bg-[#7A0019] hover:bg-[#5c0013] text-white"
                        disabled={!electionId || bulkGenerating || loading}
                        onClick={handleGenerateAll}
                      >
                        {bulkGenerating ? (
                          "Generating…"
                        ) : (
                          <>
                            <Plus className="h-4 w-4 shrink-0" aria-hidden />
                            Generate tokens for all
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 shrink-0"
                        onClick={() => loadAll(electionId)}
                        disabled={!electionId || loading}
                      >
                        <RefreshCw className="h-4 w-4 mr-1.5 shrink-0" aria-hidden />
                        Refresh
                      </Button>
                    </div>
                  </div>

                  {loading ? (
                    <div className="text-center py-12 text-gray-500">Loading…</div>
                  ) : (
                    <>
                      <div className="overflow-x-auto border rounded-md">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/40 text-left">
                              <th className="p-2 font-medium whitespace-nowrap">Student no.</th>
                              <th className="p-2 font-medium">Name</th>
                              <th className="p-2 font-medium whitespace-nowrap">Ballot status</th>
                              <th className="p-2 font-medium">Ballot token</th>
                              <th className="p-2 font-medium whitespace-nowrap">Issued at</th>
                              <th className="p-2 font-medium whitespace-nowrap">Cast</th>
                              <th className="p-2 font-medium whitespace-nowrap">Time used</th>
                              <th className="p-2 font-medium w-36">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {!electionId ? (
                              <tr>
                                <td colSpan={8} className="p-8 text-center text-muted-foreground">
                                  Select an election.
                                </td>
                              </tr>
                            ) : filteredVoters.length === 0 ? (
                              <tr>
                                <td colSpan={8} className="p-8 text-center text-muted-foreground">
                                  {voters.length === 0
                                    ? "No eligible voters found."
                                    : "No matches for your search."}
                                </td>
                              </tr>
                            ) : (
                              paginatedVoters.map((v) => {
                                const issued = tokenByStudent.get(v.studentNumber);
                                return (
                                  <tr key={v.voterId} className="border-b last:border-0">
                                    <td className="p-2 font-mono text-xs whitespace-nowrap">
                                      {v.studentNumber}
                                    </td>
                                    <td className="p-2">{v.name}</td>
                                    <td className="p-2">{statusBadge(v.paperStatus)}</td>
                                    <td className="p-2 font-mono text-xs">
                                      {v.ballotToken ?? "—"}
                                    </td>
                                    <td className="p-2 font-mono text-xs whitespace-nowrap">
                                      {issued ? formatDt(issued.timeCreated) : "—"}
                                    </td>
                                    <td className="p-2">
                                      {issued ? (
                                        <span
                                          className={`px-2 py-1 rounded text-xs font-medium ${
                                            issued.status === "Used"
                                              ? "bg-green-100 text-green-700"
                                              : "bg-gray-100 text-gray-600"
                                          }`}
                                        >
                                          {issued.status}
                                        </span>
                                      ) : (
                                        <span className="text-muted-foreground">—</span>
                                      )}
                                    </td>
                                    <td className="p-2 font-mono text-xs whitespace-nowrap">
                                      {issued?.timeUsed ? formatDt(issued.timeUsed) : "—"}
                                    </td>
                                    <td className="p-2">
                                      {v.paperStatus === "Not Issued" ? (
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          className="cursor-pointer inline-flex items-center gap-1"
                                          disabled={issuingVoterId !== null || bulkGenerating}
                                          onClick={() => handleGenerateOne(v.voterId)}
                                        >
                                          {issuingVoterId === v.voterId ? (
                                            "Generating…"
                                          ) : (
                                            <>
                                              <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                              Generate token
                                            </>
                                          )}
                                        </Button>
                                      ) : v.paperStatus === "Issued" ? (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="cursor-pointer"
                                          disabled={issuingVoterId !== null || bulkGenerating}
                                          onClick={() => handleGenerateOne(v.voterId)}
                                        >
                                          {issuingVoterId === v.voterId ? "…" : "Reprint token"}
                                        </Button>
                                      ) : (
                                        <span className="text-xs text-muted-foreground">—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>

                      {filteredVoters.length > 0 && (
                        <div className="flex flex-wrap justify-center mt-4 gap-2 text-sm text-gray-600">
                          <button
                            type="button"
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage((p) => p - 1)}
                            className="px-2 py-1 border rounded disabled:opacity-50 cursor-pointer"
                          >
                            Prev
                          </button>
                          {Array.from({ length: totalPages }, (_, i) => (
                            <button
                              type="button"
                              key={i}
                              className={`px-2 py-1 border rounded cursor-pointer min-w-[2rem] ${
                                currentPage === i + 1 ? "bg-gray-200 font-medium" : ""
                              }`}
                              onClick={() => setCurrentPage(i + 1)}
                            >
                              {i + 1}
                            </button>
                          ))}
                          <button
                            type="button"
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage((p) => p + 1)}
                            className="px-2 py-1 border rounded disabled:opacity-50 cursor-pointer"
                          >
                            Next
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  valueLabel,
  color,
}: {
  title: string;
  value?: number;
  valueLabel?: string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="py-6 flex flex-col items-center justify-center">
        <div
          className={`text-2xl font-bold text-center break-all ${color} ${
            valueLabel ? "text-base max-w-full" : ""
          }`}
        >
          {valueLabel != null ? valueLabel : value}
        </div>
        <div className="text-sm text-gray-700 mt-1 text-center">{title}</div>
      </CardContent>
    </Card>
  );
}
