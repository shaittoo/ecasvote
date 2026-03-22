"use client";

/**
 * Ballot scanning: OMR (OpenCV worker) + QR fallback, multi-mark per contest,
 * raw JSON export (ecasvote-scan-export/1).
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AdminSidebar } from "@/components/Sidebar";
import AdminHeader from "../components/header";
import {
  fetchElection,
  fetchElections,
  fetchPositions,
  scannerScanImage,
  scannerValidate,
} from "@/lib/ecasvoteApi";
import type { Election, Position } from "@/lib/ecasvoteApi";
import { notify } from "@/lib/notify";
import { BALLOT_TEMPLATE_VERSION } from "@/lib/ballot/ballotTemplate";
import { parseBallotQrPayload } from "@/lib/ballot/decodeBallotQr";
import { tryDecodeQrTextFromFile } from "@/lib/ballot/decodeQrFromImage";
import { buildScannerTemplateFromPositions } from "@/lib/ballot/scannerTemplateSpec";
import {
  buildScanExportBatch,
  parseSelectionsByPosition,
  type ScanExportAllBatches,
  type ScanExportBallotRow,
  type ScanExportBatch,
  SCAN_EXPORT_ALL_SCHEMA,
} from "@/lib/ballot/scanExport";

const OPEN_MCR_URL =
  "https://github.com/iansan5653/open-mcr?tab=readme-ov-file";
const EXAM_GRADER_URL =
  "https://sites.google.com/site/examgrader/downloads";

function friendlyValidateError(code: string): string {
  switch (code) {
    case "UNKNOWN_TOKEN":
      return "Ballot token not issued for this election (or typo in QR).";
    case "TOKEN_USED":
      return "This ballot was already scanned — token is marked used.";
    case "TEMPLATE_MISMATCH":
      return "Ballot template version does not match the issued ballot.";
    default:
      return code.length < 120 ? code : `${code.slice(0, 117)}…`;
  }
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Human-readable marks; shows multiple option ids per contest */
function formatMarksLine(sbp: Record<string, string[]>): string {
  const parts = Object.entries(sbp).filter(([, ids]) => ids.length > 0);
  if (!parts.length) return "No bubble marks detected (or below threshold).";
  return parts
    .map(([pid, ids]) =>
      ids.length > 1 ? `${pid}: ${ids.join(" + ")}` : `${pid}: ${ids[0]}`
    )
    .join(" · ");
}

function qrFromOmr(omr: Record<string, unknown>): Record<string, string> | null {
  const q = omr["qr"];
  if (!q || typeof q !== "object" || Array.isArray(q)) return null;
  const o = q as Record<string, unknown>;
  if (
    typeof o.electionId === "string" &&
    typeof o.ballotToken === "string" &&
    typeof o.templateVersion === "string"
  ) {
    return {
      electionId: o.electionId,
      ballotToken: o.ballotToken,
      templateVersion: o.templateVersion,
    };
  }
  return null;
}

type StoredScanBatch = {
  id: string;
  at: string;
  electionLabel: string;
  export: ScanExportBatch;
  validCount: number;
  errorCount: number;
};

export function BallotScanningContent() {
  const router = useRouter();
  const pathname = usePathname();
  const fileInputId = useId();
  const dropRef = useRef<HTMLDivElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [elections, setElections] = useState<Election[]>([]);
  const [electionId, setElectionId] = useState("");
  const [electionName, setElectionName] = useState("");
  const [positions, setPositions] = useState<Position[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [includeAbstain, setIncludeAbstain] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [scanHistory, setScanHistory] = useState<StoredScanBatch[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const handleLogout = () => router.push("/login");

  useEffect(() => {
    (async () => {
      try {
        const list = await fetchElections();
        setElections(list);
        if (list.length && !electionId) setElectionId(list[0].id);
      } catch (e) {
        notify.error({
          title: "Failed to load elections",
          description: String(e),
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadElectionMeta = useCallback(async (id: string) => {
    if (!id) {
      setElectionName("");
      setPositions([]);
      return;
    }
    setPositionsLoading(true);
    try {
      const [detail, pos] = await Promise.all([
        fetchElection(id).catch(() => null),
        fetchPositions(id).catch(() => [] as Position[]),
      ]);
      setElectionName(detail?.name ?? id);
      setPositions(Array.isArray(pos) ? pos : []);
    } catch (e) {
      notify.error({ title: "Failed to load election", description: String(e) });
      setPositions([]);
    } finally {
      setPositionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadElectionMeta(electionId);
  }, [electionId, loadElectionMeta]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const next = Array.from(files).filter((f) => {
      const t = f.type.toLowerCase();
      if (t.startsWith("image/")) return true;
      if (t === "application/pdf") return true;
      return /\.(png|jpe?g|tiff?|bmp|pdf)$/i.test(f.name);
    });
    if (!next.length) {
      notify.error({
        title: "No supported files",
        description: "Use PNG, JPEG, TIFF, BMP, or PDF (prefer images for OMR).",
      });
      return;
    }
    setBatchFiles((prev) => [...prev, ...next]);
  }, []);

  const removeFileAt = (index: number) => {
    setBatchFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleExportTemplate = async () => {
    if (!electionId) {
      notify.error({ title: "Select an election first" });
      return;
    }
    setExporting(true);
    try {
      let pos = positions;
      if (!pos.length) {
        pos = await fetchPositions(electionId);
        setPositions(pos);
      }
      const template = buildScannerTemplateFromPositions(
        electionId,
        electionName || electionId,
        BALLOT_TEMPLATE_VERSION,
        pos,
        { includeAbstain }
      );
      downloadJson(`scanner-template-${electionId}.json`, template);
      notify.success({ title: "Template downloaded" });
    } catch (e) {
      notify.error({ title: "Export failed", description: String(e) });
    } finally {
      setExporting(false);
    }
  };

  const exportAllBatches = () => {
    if (!scanHistory.length) return;
    const payload: ScanExportAllBatches = {
      schemaVersion: SCAN_EXPORT_ALL_SCHEMA,
      generatedAt: new Date().toISOString(),
      batches: scanHistory.map((h) => h.export),
    };
    downloadJson(
      `ballot-scan-raw-${electionId || "election"}-all-batches.json`,
      payload
    );
    notify.success({ title: "Exported all batches (raw JSON)" });
  };

  const runScanBatch = async () => {
    if (!electionId) {
      notify.error({ title: "Select an election" });
      return;
    }
    if (batchFiles.length === 0) {
      notify.error({
        title: "Add ballot images",
        description: "Drop files or choose images, then scan.",
      });
      return;
    }

    const label =
      elections.find((e) => e.id === electionId)?.name ?? electionName ?? electionId;
    const filesToScan = [...batchFiles];
    setIsScanning(true);
    const ballots: ScanExportBallotRow[] = [];

    const scanClientQrOnly = async (file: File) => {
      const decoded = await tryDecodeQrTextFromFile(file);
      if (!decoded) {
        ballots.push({
          fileName: file.name,
          scanOk: false,
          source: "client",
          message:
            "No ballot QR decoded in the browser. Try: (1) full-size image, not a small social thumbnail; (2) straight-on photo with the whole QR sharp; (3) run omr-worker + OMR_WORKER_URL — OpenCV often reads phone photos better.",
          selectionsByPosition: {},
        });
        return;
      }

      const payload = parseBallotQrPayload(decoded);
      if (!payload) {
        ballots.push({
          fileName: file.name,
          scanOk: false,
          source: "client",
          message: "QR is not valid eCASVote ballot JSON.",
          selectionsByPosition: {},
        });
        return;
      }

      if (payload.electionId !== electionId) {
        ballots.push({
          fileName: file.name,
          scanOk: false,
          source: "client",
          message: `Wrong election: QR “${payload.electionId}” vs selected “${electionId}”.`,
          qr: payload,
          selectionsByPosition: {},
        });
        return;
      }

      const v = await scannerValidate({
        electionId: payload.electionId,
        ballotToken: payload.ballotToken,
        templateVersion: payload.templateVersion,
      });

      if (v.ok) {
        ballots.push({
          fileName: file.name,
          scanOk: true,
          source: "client",
          message:
            "QR + token OK (no bubble data — start omr-worker for OpenCV marks).",
          ballotToken: payload.ballotToken,
          qr: payload,
          selectionsByPosition: {},
          tokenValidation: { ok: true, templateVersion: v.templateVersion },
        });
      } else {
        ballots.push({
          fileName: file.name,
          scanOk: false,
          source: "client",
          message: friendlyValidateError(v.error),
          qr: payload,
          selectionsByPosition: {},
          tokenValidation: { ok: false, error: v.error },
        });
      }
    };

    try {
      let pos = positions;
      if (!pos.length) {
        pos = await fetchPositions(electionId);
        setPositions(pos);
      }
      const scannerTemplate = buildScannerTemplateFromPositions(
        electionId,
        electionName || electionId,
        BALLOT_TEMPLATE_VERSION,
        pos,
        { includeAbstain }
      );

      let useOmr = true;
      let warnedWorkerOff = false;

      for (const file of filesToScan) {
        if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
          ballots.push({
            fileName: file.name,
            scanOk: false,
            source: "client",
            message: "PDF not supported — save a page as PNG or JPEG.",
            selectionsByPosition: {},
          });
          continue;
        }

        if (useOmr) {
          try {
            const imageBase64 = await fileToBase64(file);
            const r = await scannerScanImage({
              imageBase64,
              fileName: file.name,
              scannerTemplate,
            });

            if (r.mode === "worker_unavailable") {
              useOmr = false;
              if (!warnedWorkerOff) {
                warnedWorkerOff = true;
                notify.warning({
                  title: "OMR worker unavailable — QR only",
                  description:
                    "gateway .env: OMR_WORKER_URL=http://127.0.0.1:8090 · restart gateway · docker compose up in omr-worker",
                });
              }
              await scanClientQrOnly(file);
              continue;
            }

            const tv = r.tokenValidation;
            const omr = r.omr;
            const sbp = parseSelectionsByPosition(omr);
            const rawScores = omr["rawBubbleScores"] as
              | Record<string, Record<string, number | boolean>>
              | undefined;
            const flat = omr["selectionsFlat"] as Record<string, string> | undefined;
            const qr = qrFromOmr(omr);

            if ("skipped" in tv && tv.skipped) {
              ballots.push({
                fileName: r.fileName,
                scanOk: false,
                source: "omr",
                message:
                  (omr["warpApplied"] ? "Fiducial warp applied. " : "") +
                  "No ballot QR decoded in image.",
                selectionsByPosition: sbp,
                rawBubbleScores: rawScores,
                selectionsFlat: flat,
                warpApplied: omr["warpApplied"] === true,
                omrWorkerPayload: omr,
                tokenValidation: tv,
              });
              continue;
            }

            if ("ok" in tv && tv.ok) {
              ballots.push({
                fileName: r.fileName,
                scanOk: true,
                source: "omr",
                message: formatMarksLine(sbp),
                ballotToken: qr?.ballotToken,
                qr: qr ?? undefined,
                selectionsByPosition: sbp,
                rawBubbleScores: rawScores,
                selectionsFlat: flat,
                warpApplied: omr["warpApplied"] === true,
                tokenValidation: tv,
                omrWorkerPayload: omr,
              });
            } else if ("ok" in tv && tv.ok === false) {
              const err =
                "error" in tv && typeof tv.error === "string"
                  ? tv.error
                  : "UNKNOWN_TOKEN";
              ballots.push({
                fileName: r.fileName,
                scanOk: false,
                source: "omr",
                message: friendlyValidateError(err),
                qr: qr ?? undefined,
                selectionsByPosition: sbp,
                rawBubbleScores: rawScores,
                selectionsFlat: flat,
                warpApplied: omr["warpApplied"] === true,
                tokenValidation: tv,
                omrWorkerPayload: omr,
              });
            } else {
              ballots.push({
                fileName: r.fileName,
                scanOk: false,
                source: "omr",
                message: "Unexpected token validation.",
                selectionsByPosition: sbp,
                omrWorkerPayload: omr,
              });
            }
            continue;
          } catch {
            useOmr = false;
            if (!warnedWorkerOff) {
              warnedWorkerOff = true;
              notify.warning({
                title: "OMR request failed",
                description: "Falling back to browser QR for remaining files.",
              });
            }
            await scanClientQrOnly(file);
            continue;
          }
        }

        await scanClientQrOnly(file);
      }

      const exportPayload = buildScanExportBatch({
        electionId,
        electionName: label,
        ballotTemplateVersion: BALLOT_TEMPLATE_VERSION,
        scannerTemplate,
        ballots,
      });

      const validCount = ballots.filter((b) => b.scanOk).length;
      const batchId = `batch-${Date.now()}`;
      setScanHistory((h) => [
        {
          id: batchId,
          at: exportPayload.generatedAt,
          electionLabel: label,
          export: exportPayload,
          validCount,
          errorCount: ballots.length - validCount,
        },
        ...h,
      ]);
      setBatchFiles([]);

      const errC = ballots.length - validCount;
      if (errC === 0) {
        notify.success({
          title: "Scan complete",
          description: `${validCount} file(s). Use “Download raw JSON” for full data.`,
        });
      } else if (validCount === 0) {
        notify.error({
          title: "No ballots validated",
          description: `${errC} issue(s). Export JSON still contains raw rows.`,
        });
      } else {
        notify.warning({
          title: "Scan finished with issues",
          description: `${validCount} OK · ${errC} failed`,
        });
      }
    } catch (e) {
      notify.error({ title: "Scan failed", description: String(e) });
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((p) => !p)}
        active="ballot"
        userName="Admin"
        onLogout={handleLogout}
        fixed
        pathname={pathname}
      />

      <div className="flex flex-1 flex-col">
        <AdminHeader
          title="Scan ballots"
          subtitle="Multi-mark contests (maxVotes) · raw JSON export · OMR worker or browser QR fallback"
          sidebarOpen={sidebarOpen}
        />

        <main
          className={`flex-1 overflow-y-auto p-6 transition-all duration-300 ${
            sidebarOpen ? "ml-64" : "ml-20"
          }`}
        >
          {loading ? (
            <div className="py-12 text-center text-gray-500">Loading elections…</div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-6">
              <Card className="border-[#7A0019]/20 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl">Scan paper ballots</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Upload <strong>PNG / JPEG</strong> (prefer <strong>original / full size</strong>, not
                    compressed social thumbnails). OMR reads{" "}
                    <strong>multiple shaded bubbles</strong> per contest when{" "}
                    <code className="rounded bg-muted px-1">maxVotes &gt; 1</code>. Each batch can
                    be exported as <code className="rounded bg-muted px-1">ecasvote-scan-export/1</code>{" "}
                    JSON (selections as arrays + raw bubble scores).
                  </p>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div>
                    <label
                      htmlFor="scan-election"
                      className="mb-1 block text-sm font-medium text-gray-900"
                    >
                      Election
                    </label>
                    <select
                      id="scan-election"
                      className="h-10 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm"
                      value={electionId}
                      onChange={(e) => setElectionId(e.target.value)}
                    >
                      {elections.length === 0 ? (
                        <option value="">No elections</option>
                      ) : (
                        elections.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name || e.id}
                          </option>
                        ))
                      )}
                    </select>
                    {positionsLoading ? (
                      <p className="mt-1 text-xs text-muted-foreground">Loading layout…</p>
                    ) : electionId ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {positions.length} contest(s) — multi-seat races allow multiple marks per
                        scan.
                      </p>
                    ) : null}
                  </div>

                  <div
                    ref={dropRef}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        document.getElementById(fileInputId)?.click();
                      }
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      if (!dropRef.current?.contains(e.relatedTarget as Node)) {
                        setDragActive(false);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragActive(false);
                      if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
                    }}
                    className={cn(
                      "rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
                      dragActive
                        ? "border-[#7A0019] bg-[#7A0019]/5"
                        : "border-gray-300 bg-white hover:border-gray-400"
                    )}
                  >
                    <p className="text-sm font-medium text-gray-900">Drop ballot images here</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      PNG, JPEG, TIFF, BMP (recommended for OMR)
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <label htmlFor={fileInputId}>
                        <span
                          className={cn(
                            buttonVariants({ variant: "outline" }),
                            "cursor-pointer"
                          )}
                        >
                          Choose files
                        </span>
                      </label>
                      <input
                        id={fileInputId}
                        type="file"
                        accept="image/png,image/jpeg,image/tiff,image/bmp,application/pdf,.pdf"
                        multiple
                        className="sr-only"
                        disabled={!electionId}
                        onChange={(e) => {
                          if (e.target.files?.length) addFiles(e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </div>
                  </div>

                  {batchFiles.length > 0 && (
                    <div className="rounded-md border bg-white">
                      <div className="border-b bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700">
                        Queue ({batchFiles.length})
                      </div>
                      <ul className="max-h-48 divide-y overflow-y-auto text-sm">
                        {batchFiles.map((f, i) => (
                          <li
                            key={`${f.name}-${i}-${f.size}`}
                            className="flex items-center justify-between gap-2 px-3 py-2"
                          >
                            <span className="truncate text-gray-800" title={f.name}>
                              {f.name}
                            </span>
                            <button
                              type="button"
                              className="shrink-0 text-xs text-red-600 underline"
                              onClick={() => removeFileAt(i)}
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="bg-[#7A0019] text-white hover:bg-[#5c0013]"
                      disabled={!electionId || batchFiles.length === 0 || isScanning}
                      onClick={() => void runScanBatch()}
                    >
                      {isScanning ? "Scanning…" : "Scan ballots"}
                    </Button>
                    {batchFiles.length > 0 && (
                      <Button type="button" variant="outline" onClick={() => setBatchFiles([])}>
                        Clear queue
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle>Results &amp; raw export</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Schema <code className="rounded bg-muted px-1">ecasvote-scan-export/1</code>
                        : per file — <code className="rounded bg-muted px-1">selectionsByPosition</code>{" "}
                        (string arrays for multi-mark),{" "}
                        <code className="rounded bg-muted px-1">rawBubbleScores</code>, token check,
                        full <code className="rounded bg-muted px-1">omrWorkerPayload</code> when OMR
                        ran.
                      </p>
                    </div>
                    {scanHistory.length > 0 && (
                      <Button type="button" variant="outline" size="sm" onClick={exportAllBatches}>
                        Export all batches (JSON)
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {scanHistory.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No batches yet. Scan above, then download raw JSON per batch or all batches.
                    </p>
                  ) : (
                    <ul className="space-y-4">
                      {scanHistory.map((b) => {
                        const allOk = b.errorCount === 0;
                        const noneOk = b.validCount === 0;
                        const borderClass = allOk
                          ? "border-emerald-200 bg-emerald-50/90"
                          : noneOk
                            ? "border-red-200 bg-red-50/80"
                            : "border-amber-200 bg-amber-50/80";
                        return (
                          <li
                            key={b.id}
                            className={cn("rounded-md border px-4 py-3 text-sm", borderClass)}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium text-gray-900">{b.electionLabel}</span>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs text-muted-foreground">
                                  {new Date(b.at).toLocaleString()}
                                </span>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => {
                                    downloadJson(
                                      `ballot-scan-raw-${electionId}-${b.id}.json`,
                                      b.export
                                    );
                                    notify.success({ title: "Raw JSON downloaded" });
                                  }}
                                >
                                  Download raw JSON
                                </Button>
                              </div>
                            </div>
                            <p className="mt-1 text-xs font-medium text-gray-800">
                              {b.validCount} OK · {b.errorCount} failed · {b.export.ballots.length}{" "}
                              file(s)
                            </p>
                            <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto text-xs">
                              {b.export.ballots.map((row, idx) => (
                                <li
                                  key={`${b.id}-${idx}-${row.fileName}`}
                                  className={cn(
                                    "rounded border px-2 py-1.5",
                                    row.scanOk
                                      ? "border-emerald-200 bg-white/80"
                                      : "border-red-200 bg-white/80"
                                  )}
                                >
                                  <div className="flex flex-wrap items-center gap-2 font-medium">
                                    <span>{row.fileName}</span>
                                    <span
                                      className={cn(
                                        "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                                        row.source === "omr"
                                          ? "bg-violet-100 text-violet-900"
                                          : "bg-slate-100 text-slate-700"
                                      )}
                                    >
                                      {row.source === "omr" ? "OpenCV OMR" : "QR only"}
                                    </span>
                                  </div>
                                  {Object.keys(row.selectionsByPosition).some(
                                    (k) => (row.selectionsByPosition[k] ?? []).length > 0
                                  ) ? (
                                    <pre className="mt-1 max-w-full overflow-x-auto rounded bg-muted/50 p-1.5 font-mono text-[10px] leading-relaxed">
                                      {JSON.stringify(row.selectionsByPosition, null, 2)}
                                    </pre>
                                  ) : null}
                                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                                    {row.message}
                                  </p>
                                  {row.scanOk && row.ballotToken ? (
                                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                                      Token: {row.ballotToken}
                                    </p>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <details className="rounded-lg border bg-white">
                <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-gray-800 hover:bg-gray-50">
                  Advanced: template &amp; OMR links
                </summary>
                <div className="space-y-4 border-t px-4 py-4 text-sm">
                  <p className="text-muted-foreground">
                    <a href={OPEN_MCR_URL} className="text-primary underline" target="_blank" rel="noreferrer">
                      Open MCR
                    </a>{" "}
                    uses fixed PDF forms. We use{" "}
                    <strong>omr-worker</strong> (OpenCV).{" "}
                    <a href={EXAM_GRADER_URL} className="text-primary underline" target="_blank" rel="noreferrer">
                      ExamGrader
                    </a>{" "}
                    — offline only.
                  </p>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includeAbstain}
                      onChange={(e) => setIncludeAbstain(e.target.checked)}
                      className="rounded border-input"
                    />
                    Include ABSTAIN in template export
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!electionId || exporting}
                      onClick={() => void handleExportTemplate()}
                    >
                      {exporting ? "…" : "Scanner template JSON"}
                    </Button>
                    <Link
                      href={
                        electionId
                          ? `/admin/ballot-print?electionId=${encodeURIComponent(electionId)}`
                          : "/admin/ballot-print"
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                    >
                      Ballot print
                    </Link>
                  </div>
                </div>
              </details>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
