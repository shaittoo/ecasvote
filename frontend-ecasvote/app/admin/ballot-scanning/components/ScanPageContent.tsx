"use client";

/**
 * Scan page for a specific election.
 * Uses the SAME scanning logic as BallotScanningContent:
 * - Off-screen PrintableBallotSheet for geometry measurement
 * - buildFullScannerTemplate for template building
 * - scannerScanImage / scannerDebugImage through the gateway
 * - QR decode, token validation, governor filtering
 *
 * New UI: scan method cards → ballot preview → results modal with override.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AdminSidebar } from "@/components/Sidebar";
import AdminHeader from "@/app/admin/components/header";
import {
  fetchElection,
  fetchPositions,
  fetchOmrLayout,
  scannerDebugImage,
  scannerScanImage,
  scannerValidate,
  confirmPaperVote,
} from "@/lib/ecasvoteApi";
import type { Election, Position } from "@/lib/ecasvoteApi";
import { notify } from "@/lib/notify";
import { BALLOT_TEMPLATE_VERSION } from "@/lib/ballot/ballotTemplate";
import { buildScannerTemplateFromPositions } from "@/lib/ballot/scannerTemplateSpec";
import { PrintableBallotSheet } from "@/components/ballot/PrintableBallotSheet";
import { mapPositionsToPrintableBallot } from "@/lib/ballot/mapPositionsToPrintable";
import { filterPositionsByVoterDepartment } from "@/lib/ballot/filterPositionsByDepartment";
import { buildPreviewBallotToken } from "@/lib/ballot/previewBallotId";
import { parseBallotQrPayload } from "@/lib/ballot/decodeBallotQr";
import { tryDecodeQrTextFromFile } from "@/lib/ballot/decodeQrFromImage";
import type { OmGeometryTemplate } from "@/lib/ballot/omGeometryTemplate";
import { ScanResultsModal } from "./ScanResultsModal";

/* ── helpers (copied from BallotScanningContent) ─────────────────────── */

function normalizeGeometry(geom: OmGeometryTemplate): OmGeometryTemplate {
  const { width: pw, height: ph } = geom.page;
  if (pw <= 0 || ph <= 0) return geom;
  return {
    ...geom,
    page: { width: 1, height: 1 },
    contests: geom.contests.map((c) => ({
      ...c,
      bubbles: c.bubbles.map((b) => ({
        ...b,
        x: b.x / pw,
        y: b.y / ph,
        w: b.w / pw,
        h: b.h / ph,
      })),
    })),
  };
}

function buildFullScannerTemplate(
  geom: OmGeometryTemplate,
  positions: Position[],
  electionId: string,
  electionName: string,
  includeAbstain: boolean
) {
  const base = buildScannerTemplateFromPositions(
    electionId,
    electionName,
    BALLOT_TEMPLATE_VERSION,
    positions,
    { includeAbstain }
  );
  const normalized = normalizeGeometry(geom);
  const pw = geom.page.width;
  const ph = geom.page.height;
  const geometry: OmGeometryTemplate =
    pw > 1 && ph > 1
      ? { ...normalized, pageMeasuredPx: { width: pw, height: ph } }
      : normalized;
  return { ...base, geometry };
}

function logScannerTemplateContestIds(scannerTemplate: unknown) {
  const t = scannerTemplate as {
    geometry?: { contests?: { positionId?: string; id?: string }[] };
    contests?: { positionId?: string; id?: string }[];
  };
  console.log(
    "SCANNER TEMPLATE CONTEST IDS:",
    t?.geometry?.contests?.map((c) => c.positionId || c.id) ??
      t?.contests?.map((c) => c.positionId || c.id),
  );
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

function formatMarksLine(sbp: Record<string, string[]>): string {
  const parts = Object.entries(sbp).filter(([, ids]) => ids.length > 0);
  if (!parts.length) return "No bubble marks detected.";
  return parts
    .map(([pid, ids]) =>
      ids.length > 1 ? `${pid}: ${ids.join(" + ")}` : `${pid}: ${ids[0]}`
    )
    .join(" · ");
}

function parseSelectionsByPosition(
  omr: Record<string, unknown>
): Record<string, string[]> {
  const raw = omr["selectionsByPosition"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(v)) {
      result[k] = v.map(String);
    } else if (typeof v === "string" && v.trim()) {
      result[k] = v.split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      result[k] = [];
    }
  }
  return result;
}

/* ── types ────────────────────────────────────────────────────────────── */

export type ScanState =
  | "idle"
  | "scanning"
  | "processing"
  | "results"
  | "submitting"
  | "submitted";

export interface BubbleOverlayItem {
  positionId: string;
  optionId: string;
  innerDarkRatio: number;
  innerCcRatio: number;
  coreMeanDark: number;
  score: number;
  fillClassification: string;
  filled: boolean;
  validityPass?: boolean;
  validityReason?: string;
}

export interface ContestReadItem {
  positionId: string;
  maxVotes: number;
  selectedOptionIds: string[];
  overvoteDetected?: boolean;
  undervoteDetected?: boolean;
  abstainConflict?: boolean;
  validVoteCount?: number;
  invalidMarkings?: Array<{ optionId: string; reason: string }>;
  validityResults?: Record<string, { valid: boolean; reason: string }>;
}

export interface ScanResult {
  image_base64?: string;
  selectionsByPosition: Record<string, string[]>;
  ballotId?: string;
  electionId?: string;
  confidence?: number;
  ballotStatus?: "VALID" | "INVALID";
  academicOrg?: string;
  ballotInvalidReasons?: Array<{
    type: string;
    contestId?: string;
    optionId?: string;
    reason?: string;
    validVotes?: number;
    maxAllowed?: number;
  }>;
  bubbleRead?: {
    bubbleOverlay?: BubbleOverlayItem[];
    contestsRead?: ContestReadItem[];
    contestsDetected?: number;
    contestsInTemplate?: number;
  };
}

/* ── component ────────────────────────────────────────────────────────── */

export function ScanPageContent() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fileInputId = useId();
  const electionId = params.electionId as string;

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [election, setElection] = useState<Election | null>(null);
  const [electionName, setElectionName] = useState("");
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  // Geometry (same as BallotScanningContent)
  const [omGeometryTemplate, setOmGeometryTemplate] =
    useState<OmGeometryTemplate | null>(null);
  const urlGovernorOverride = searchParams.get("department")?.trim() ?? "";
  const previewAllGovernors = searchParams.get("allGovernors") === "1";
  const [governorFilterFromBallot, setGovernorFilterFromBallot] =
    useState<string | null>(null);

  // Scan state
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [omrOffline, setOmrOffline] = useState(false);
  const [debugImageSrc, setDebugImageSrc] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const handleLogout = () => router.push("/login");

  /* ── governor filter (same as BallotScanningContent) ───────────────── */

  const effectiveGovernorFilter = useMemo(() => {
    if (previewAllGovernors) return "";
    if (urlGovernorOverride) return urlGovernorOverride;
    return governorFilterFromBallot ?? "";
  }, [previewAllGovernors, urlGovernorOverride, governorFilterFromBallot]);

  const positionsForPreview = useMemo(() => {
    const d = effectiveGovernorFilter.trim();
    if (!d) return positions;
    return filterPositionsByVoterDepartment(positions, d);
  }, [positions, effectiveGovernorFilter]);

  const printablePositions = useMemo(
    () => mapPositionsToPrintableBallot(positionsForPreview),
    [positionsForPreview]
  );

  /* ── load election + positions ─────────────────────────────────────── */

  useEffect(() => {
    if (!electionId) return;
    Promise.all([fetchElection(electionId), fetchPositions(electionId)])
      .then(([el, pos]) => {
        setElection(el);
        setElectionName(el?.name ?? electionId);
        setPositions(Array.isArray(pos) ? pos : []);
      })
      .catch(() =>
        notify.error({
          title: "Failed to load election data",
          description: "Check that the gateway is running.",
        })
      )
      .finally(() => setLoading(false));
  }, [electionId]);

  useEffect(() => {
    setOmGeometryTemplate(null);
  }, [electionId, effectiveGovernorFilter]);

  /* ── scan ballot (same logic as BallotScanningContent.runScanBatch) ── */

  const processSingleBallot = useCallback(
    async (file: File) => {
      if (!omGeometryTemplate) {
        notify.error({
          title: "Scanner geometry not ready",
          description: "Wait for geometry measurement to complete.",
        });
        return;
      }

      setScanState("processing");
      try {
        const imageBase64 = await fileToBase64(file);
        const scannerTemplate = buildFullScannerTemplate(
          omGeometryTemplate,
          positions,
          electionId,
          electionName,
          true
        );
        logScannerTemplateContestIds(scannerTemplate);

        // 1. Scan (same as BallotScanningContent)
        const r = await scannerScanImage({
          imageBase64,
          fileName: file.name,
          scannerTemplate,
        });

        if (r.mode === "worker_unavailable") {
          setOmrOffline(true);
          notify.warning({
            title: "OMR scanner is currently unavailable",
            description: "The system will attempt to read the QR code using the browser. For best results, ensure the QR code is clearly visible in the image.",
          });
          setScanState("idle");
          return;
        }

        // 2. Debug overlay
        const dbg = await scannerDebugImage({ imageBase64, scannerTemplate });
        if (dbg.image_base64) {
          setDebugImageSrc(`data:image/png;base64,${dbg.image_base64}`);
        }

        // 3. Extract results from omr (same parsing as BallotScanningContent)
        const omr = r.omr;
        const sbp = parseSelectionsByPosition(omr);
        const bubbleRead = (omr.bubbleRead ?? {}) as Record<string, unknown>;
        const contestsRead = (bubbleRead.contestsRead ?? []) as ContestReadItem[];
        const bubbleOverlay = (bubbleRead.bubbleOverlay ?? []) as BubbleOverlayItem[];

        // Extract QR info
        const qrObj = omr.qr as Record<string, unknown> | undefined;
        const ballotId = String(
          omr.ballotId ??
          qrObj?.ballotToken ??
          qrObj?.ballotId ??
          ""
        );

        // Auto-detect governor org from layout
        if (ballotId && !governorFilterFromBallot && !urlGovernorOverride && !previewAllGovernors) {
          try {
            const rec = await fetchOmrLayout(ballotId);
            if (rec.academicOrg?.trim()) {
              setGovernorFilterFromBallot(rec.academicOrg.trim());
            }
          } catch { /* no layout */ }
        }

        const result: ScanResult = {
          image_base64: dbg.image_base64,
          selectionsByPosition: sbp,
          ballotId: ballotId || undefined,
          electionId: String(omr.electionId ?? electionId),
          confidence: typeof omr.confidence === "number" ? omr.confidence : 0,
          ballotStatus: String(omr.ballotStatus ?? "VALID") as "VALID" | "INVALID",
          ballotInvalidReasons: (omr.ballotInvalidReasons ?? []) as ScanResult["ballotInvalidReasons"],
          bubbleRead: {
            bubbleOverlay,
            contestsRead,
            contestsDetected: dbg.contestsDetected,
            contestsInTemplate: dbg.contestsInTemplate,
          },
        };

        setScanResult(result);
        setScanState("results");
        setShowResultsModal(true);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Scan failed";
        notify.error({ title: msg });
        setScanState("idle");
      }
    },
    [omGeometryTemplate, positions, electionId, electionName, governorFilterFromBallot, urlGovernorOverride, previewAllGovernors]
  );

  const handleFileUpload = useCallback(
    async (files: FileList | File[]) => {
      const imageFiles = Array.from(files).filter((f) => {
        const t = f.type.toLowerCase();
        return t.startsWith("image/");
      });
      if (!imageFiles.length) {
        notify.error({ title: "Please upload a PNG or JPEG image" });
        return;
      }
      setScanState("scanning");
      await processSingleBallot(imageFiles[0]);
    },
    [processSingleBallot]
  );

  /* ── submit vote ───────────────────────────────────────────────────── */

  const handleSubmit = useCallback(
    async (finalSelections: Record<string, string[]>) => {
      if (!scanResult?.ballotId) {
        notify.error({ title: "No ballot token detected. Cannot submit." });
        return;
      }
      setScanState("submitting");
      try {
        await confirmPaperVote({
          electionId,
          ballotToken: scanResult.ballotId,
          selections: finalSelections,
        });
        setScanState("submitted");
        setShowResultsModal(false);
        notify.success({ title: "Vote recorded successfully" });
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : "Submit failed";
        let msg = "An error occurred. Please try again or contact the SEB.";
        if (raw.includes("TOKEN_USED")) {
          msg = "This ballot token has already been used. Each voter can only cast one ballot. If you believe this is an error, please contact the SEB.";
        } else if (raw.includes("UNKNOWN_TOKEN")) {
          msg = "Invalid ballot token. Please verify the token and try again.";
        } else if (raw.includes("TEMPLATE_MISMATCH")) {
          msg = "Ballot template does not match. Please reprint the ballot.";
        } else {
          console.error("Vote submission error:", raw);
        }
        notify.error({ title: msg });
        setScanState("results");
      }
    },
    [electionId, scanResult]
  );

  /* ── rescan ────────────────────────────────────────────────────────── */

  const handleRescan = useCallback(() => {
    setScanState("idle");
    setDebugImageSrc(null);
    setScanResult(null);
    setShowResultsModal(false);
  }, []);

  /* ── render ─────────────────────────────────────────────────────────── */

  const geometryReady = !!omGeometryTemplate;

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
          title="Ballot Scanning"
          subtitle={election?.name ?? electionId}
          sidebarOpen={sidebarOpen}
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/admin/ballot-scanning")}
            >
              ← Change Election
            </Button>
          }
        />
        <main
          className={`flex-1 overflow-y-auto p-6 transition-all duration-300 ${
            sidebarOpen ? "ml-64" : "ml-20"
          }`}
        >
          {/* Off-screen geometry measurement (same as BallotScanningContent) */}
          {electionId && printablePositions.length > 0 && (
            <div style={{ position: "relative", width: 0, height: 0, overflow: "visible" }}>
              <div
                style={{
                  position: "absolute",
                  left: "-10000px",
                  top: 0,
                  width: "794px",
                  minWidth: "794px",
                  background: "white",
                  pointerEvents: "none",
                  zIndex: 0,
                }}
              >
                <PrintableBallotSheet
                  key={`${electionId}-${effectiveGovernorFilter}`}
                  electionId={electionId}
                  ballotToken={buildPreviewBallotToken(electionId)}
                  templateVersion={BALLOT_TEMPLATE_VERSION}
                  electionName={electionName || electionId}
                  positions={printablePositions}
                  showAbstain
                  onGeometryTemplateReady={(geom) => {
                    console.log(
                      "SCAN PAGE GEOMETRY READY:",
                      geom.contests.map((c) => c.positionId),
                    );
                    setOmGeometryTemplate(geom);
                  }}
                />
              </div>
            </div>
          )}

          {omrOffline && (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
              <span className="text-lg">&#9888;&#65039;</span>
              <span><strong>OMR Worker Offline</strong> — Paper ballot bubble detection is unavailable. QR code scanning only.</span>
            </div>
          )}
          {loading ? (
            <div className="py-16 text-center text-gray-500">Loading…</div>
          ) : (
            <div className="mx-auto max-w-5xl space-y-6">
              {/* Geometry status */}
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>OMR Geometry:</span>
                {geometryReady ? (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                    Ready ({omGeometryTemplate!.contests.length} contests)
                  </Badge>
                ) : (
                  <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">
                    Measuring…
                  </Badge>
                )}
              </div>

              {/* Success after submit */}
              {scanState === "submitted" && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
                  <p className="text-sm font-medium text-emerald-800">
                    ✓ Vote submitted successfully for ballot{" "}
                    <span className="font-mono">{scanResult?.ballotId}</span>
                  </p>
                  <Button
                    className="mt-3 bg-[#7A0019] hover:bg-[#5c0013] text-white"
                    onClick={handleRescan}
                  >
                    Scan Next Ballot
                  </Button>
                </div>
              )}

              {/* Scan method picker */}
              {scanState === "idle" && (
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Document Scanner */}
                  <Card className="border-[#7A0019]/15 transition-shadow hover:shadow-md">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <span className="text-xl">📄</span>
                        Document Scanner
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-500 mb-3">
                        Scan directly from a connected document scanner.
                      </p>
                      <Button
                        className="w-full bg-[#7A0019] hover:bg-[#5c0013] text-white"
                        disabled={!geometryReady}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {geometryReady ? "Start Scanning" : "Waiting for geometry…"}
                      </Button>
                    </CardContent>
                  </Card>

                  {/* File Upload */}
                  <Card className="border-[#7A0019]/15 transition-shadow hover:shadow-md">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <span className="text-xl">📁</span>
                        Upload File
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-500 mb-3">
                        Upload a scanned ballot image (PNG or JPEG).
                      </p>
                      <div
                        ref={dropRef}
                        onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
                        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          if (!dropRef.current?.contains(e.relatedTarget as Node))
                            setDragActive(false);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragActive(false);
                          if (e.dataTransfer.files?.length)
                            handleFileUpload(e.dataTransfer.files);
                        }}
                        className={cn(
                          "cursor-pointer rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
                          !geometryReady
                            ? "opacity-50 pointer-events-none border-gray-200"
                            : dragActive
                            ? "border-[#7A0019] bg-[#7A0019]/5"
                            : "border-gray-300 hover:border-[#7A0019]/40"
                        )}
                        onClick={() => geometryReady && fileInputRef.current?.click()}
                      >
                        <p className="text-sm text-gray-600">
                          {!geometryReady
                            ? "Waiting for geometry measurement…"
                            : dragActive
                            ? "Drop image here"
                            : "Click or drag & drop a ballot image"}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) handleFileUpload(e.target.files);
                  e.target.value = "";
                }}
              />

              {/* Processing indicator */}
              {(scanState === "scanning" || scanState === "processing") && (
                <Card className="border-[#7A0019]/20">
                  <CardContent className="py-12 text-center">
                    <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-[#7A0019]/20 border-t-[#7A0019]" />
                    <p className="text-sm font-medium text-gray-700">
                      {scanState === "scanning"
                        ? "Reading image…"
                        : "Processing ballot (OMR detection)…"}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Ballot preview */}
              {debugImageSrc && scanState !== "submitted" && (
                <Card className="border-[#7A0019]/20">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        Scanned Ballot Preview
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        {scanResult?.ballotId && (
                          <Badge variant="outline" className="font-mono text-xs">
                            {scanResult.ballotId}
                          </Badge>
                        )}
                        {scanResult?.ballotStatus && (
                          <Badge
                            className={
                              scanResult.ballotStatus === "VALID"
                                ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                : "bg-red-100 text-red-800 border-red-200"
                            }
                          >
                            {scanResult.ballotStatus}
                          </Badge>
                        )}
                        {scanResult?.confidence != null && (
                          <Badge variant="outline" className="text-xs">
                            {(scanResult.confidence * 100).toFixed(0)}% confidence
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-auto rounded-md border bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={debugImageSrc}
                        alt="Scanned ballot with OMR overlay"
                        className="mx-auto max-h-[600px] w-auto"
                      />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowResultsModal(true)}
                        disabled={!scanResult}
                      >
                        Review Results
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleRescan}>
                        Rescan
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Results modal */}
          {scanResult && (
            <ScanResultsModal
              open={showResultsModal}
              onClose={() => setShowResultsModal(false)}
              scanResult={scanResult}
              positions={positions}
              electionName={election?.name ?? electionId}
              submitting={scanState === "submitting"}
              onConfirm={handleSubmit}
              onRescan={handleRescan}
            />
          )}
        </main>
      </div>
    </div>
  );
}