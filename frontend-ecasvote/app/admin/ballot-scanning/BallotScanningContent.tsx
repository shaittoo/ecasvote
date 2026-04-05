"use client";

/**
 * Ballot scanning: OMR (OpenCV worker) + QR fallback, multi-mark per contest,
 * raw JSON export (ecasvote-scan-export/1).
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AdminSidebar } from "@/components/Sidebar";
import AdminHeader from "../components/header";
import {
  fetchElection,
  fetchElections,
  fetchOmrLayout,
  fetchPositions,
  scannerDebugImage,
  scannerScanImage,
  scannerValidate,
} from "@/lib/ecasvoteApi";
import type { Election, Position } from "@/lib/ecasvoteApi";
import { notify } from "@/lib/notify";
import { BALLOT_TEMPLATE_VERSION } from "@/lib/ballot/ballotTemplate";
import type { BallotQrPayload } from "@/lib/ballot/printableBallotTypes";
import { parseBallotQrPayload } from "@/lib/ballot/decodeBallotQr";
import { tryDecodeQrTextFromFile } from "@/lib/ballot/decodeQrFromImage";
import { PrintableBallotSheet } from "@/components/ballot/PrintableBallotSheet";
import { mapPositionsToPrintableBallot } from "@/lib/ballot/mapPositionsToPrintable";
import { filterPositionsByVoterDepartment } from "@/lib/ballot/filterPositionsByDepartment";
import { buildPreviewBallotToken } from "@/lib/ballot/previewBallotId";
import {
  buildScanExportBatch,
  parseSelectionsByPosition,
  type ScanExportAllBatches,
  type ScanExportBallotRow,
  type ScanExportBatch,
  SCAN_EXPORT_ALL_SCHEMA,
} from "@/lib/ballot/scanExport";
import type { OmGeometryTemplate } from "@/lib/ballot/omGeometryTemplate";

/** Gateway/worker expect `scannerTemplate` object with a `geometry` field (DOM-measured layout). */
function scannerTemplateFromGeometry(geom: OmGeometryTemplate): { geometry: OmGeometryTemplate } {
  return { geometry: geom };
}

/** Scan/debug payload: measured `geometry` must match the printed ballot contest set (use voter-filtered preview). */
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

function isTokenUsedValidation(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return o.ok === false && o.error === "TOKEN_USED";
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

function qrFromOmr(omr: Record<string, unknown>): BallotQrPayload | null {
  const q = omr["qr"];
  if (!q || typeof q !== "object" || Array.isArray(q)) return null;
  try {
    return parseBallotQrPayload(JSON.stringify(q));
  } catch {
    return null;
  }
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
  const searchParams = useSearchParams();
  const fileInputId = useId();
  const dropRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const autoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const autoRunRef = useRef<number | null>(null);
  const overlayRunRef = useRef<number | null>(null);
  const stableFramesRef = useRef(0);
  const captureCooldownRef = useRef(0);
  const capturedForCurrentPresenceRef = useRef(false);
  const qrWarnCooldownRef = useRef(0);
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
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraDeviceId, setCameraDeviceId] = useState("");
  const [autoCapture, setAutoCapture] = useState(false);
  const [showLiveBubbleOverlay, setShowLiveBubbleOverlay] = useState(true);
  const [cameraPreviewTopAlign, setCameraPreviewTopAlign] = useState(true);
  const [edgeStatus, setEdgeStatus] = useState<
    "idle" | "searching" | "detected" | "captured"
  >("idle");
  const [debugOverlayBusy, setDebugOverlayBusy] = useState(false);
  const [debugOverlayImage, setDebugOverlayImage] = useState<string | null>(null);
  const [debugOverlayMeta, setDebugOverlayMeta] = useState<{
    contestsDetected?: number;
    contestsInTemplate?: number;
    fileName: string;
  } | null>(null);
  const [omGeometryTemplate, setOmGeometryTemplate] = useState<OmGeometryTemplate | null>(null);
  /** Non-empty `?department=` forces the governor row (same as ballot print). */
  const urlGovernorOverride = searchParams.get("department")?.trim() ?? "";
  /** `?allGovernors=1` keeps every `*-governor` contest in the preview (admin). */
  const previewAllGovernors = searchParams.get("allGovernors") === "1";
  /** Set from POST /scanner/validate after a decodable ballot QR (issued roster org). */
  const [governorFilterFromBallot, setGovernorFilterFromBallot] = useState<string | null>(null);

  const handleLogout = () => router.push("/login");

  useEffect(() => {
    setGovernorFilterFromBallot(null);
  }, [electionId]);

  const effectiveGovernorFilter = useMemo(() => {
    if (previewAllGovernors) return "";
    if (urlGovernorOverride) return urlGovernorOverride;
    return governorFilterFromBallot ?? "";
  }, [previewAllGovernors, urlGovernorOverride, governorFilterFromBallot]);

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

  useEffect(() => {
    setOmGeometryTemplate(null);
  }, [electionId, includeAbstain, effectiveGovernorFilter]);

  const positionsForPreview = useMemo(() => {
    const d = effectiveGovernorFilter.trim();
    if (!d) return positions;
    return filterPositionsByVoterDepartment(positions, d);
  }, [positions, effectiveGovernorFilter]);

  /** When images are queued, read the first decodable QR; org + contests come from GET /api/omr-layout (saved with print). */
  useEffect(() => {
    if (previewAllGovernors || urlGovernorOverride || !electionId || batchFiles.length === 0) {
      if (batchFiles.length === 0 && !urlGovernorOverride && !previewAllGovernors) {
        setGovernorFilterFromBallot(null);
      }
      return;
    }
    let cancelled = false;
    void (async () => {
      for (const file of batchFiles) {
        if (cancelled) return;
        const decoded = await tryDecodeQrTextFromFile(file);
        if (!decoded) continue;
        const payload = parseBallotQrPayload(decoded);
        if (!payload || payload.electionId !== electionId) continue;

        let org: string | null = null;
        try {
          const rec = await fetchOmrLayout(payload.ballotToken);
          const o = rec.academicOrg?.trim();
          if (o) {
            org = o;
            setGovernorFilterFromBallot(o);
            console.log("AUTO ORG:", o);
          }
          if (rec.allowedContestIds?.length) {
            console.log("ALLOWED CONTEST IDS (saved layout):", rec.allowedContestIds);
          }
        } catch {
          /* layout not persisted (e.g. preview token) — fall back to validate */
        }

        if (!org) {
          const v = await scannerValidate({
            electionId: payload.electionId,
            ballotToken: payload.ballotToken,
            templateVersion: payload.templateVersion,
          });
          if (cancelled) return;
          if (v.ok && typeof v.voterDepartment === "string" && v.voterDepartment.trim()) {
            org = v.voterDepartment.trim();
            setGovernorFilterFromBallot(org);
            console.log("AUTO ORG (validate fallback):", org);
          }
        }

        if (cancelled) return;
        if (org) {
          const filtered = filterPositionsByVoterDepartment(positions, org);
          console.log("FILTERED POSITION IDS (preview):", filtered.map((p) => p.id));
        }

        break;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [batchFiles, electionId, positions, previewAllGovernors, urlGovernorOverride]);

  useEffect(() => {
    if (!electionId || positions.length === 0) return;
    console.log("PREVIEW POSITIONS IDS:", positionsForPreview.map((p) => p.id));
  }, [electionId, positions.length, positionsForPreview]);

  const printablePositions = useMemo(
    () => mapPositionsToPrintableBallot(positionsForPreview),
    [positionsForPreview]
  );

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

  const previewDebugOverlay = useCallback(async () => {
    if (!batchFiles.length) {
      notify.error({ title: "Add a file first" });
      return;
    }
    if (!electionId) {
      notify.error({ title: "Select an election first" });
      return;
    }
    const first = batchFiles[0];
    const imageBase64 = await fileToBase64(first);
    if (!imageBase64) {
      throw new Error("Missing imageBase64");
    }
    if (!omGeometryTemplate) {
      window.alert(
        "Scanner template not ready yet. Wait for “OMR geometry: Ready” below, or check that contests loaded."
      );
      return;
    }
    const scannerTemplate = scannerTemplateFromGeometry(omGeometryTemplate);
    logScannerTemplateContestIds(scannerTemplate);
    console.log({
      hasImageBase64: !!imageBase64,
      hasTemplate: !!omGeometryTemplate,
      templateType: typeof omGeometryTemplate,
      previewGeometryContestCount: omGeometryTemplate.contests.length,
    });
    console.log("DEBUG sending /scanner/debug-image payload keys:", [
      "imageBase64",
      "scannerTemplate",
    ]);
    setDebugOverlayBusy(true);
    try {
      const dbg = await scannerDebugImage({ imageBase64, scannerTemplate });
      if (!dbg.image_base64) {
        throw new Error("No debug image returned by worker.");
      }
      setDebugOverlayImage(`data:image/png;base64,${dbg.image_base64}`);
      setDebugOverlayMeta({
        contestsDetected: dbg.contestsDetected,
        contestsInTemplate: dbg.contestsInTemplate,
        fileName: first.name,
      });
    } catch (e) {
      notify.error({
        title: "Debug overlay failed",
        description: String(e),
      });
    } finally {
      setDebugOverlayBusy(false);
    }
  }, [batchFiles, electionId, omGeometryTemplate]);

  const stopCamera = useCallback(() => {
    if (autoRunRef.current !== null) {
      cancelAnimationFrame(autoRunRef.current);
      autoRunRef.current = null;
    }
    if (overlayRunRef.current !== null) {
      cancelAnimationFrame(overlayRunRef.current);
      overlayRunRef.current = null;
    }
    stableFramesRef.current = 0;
    capturedForCurrentPresenceRef.current = false;
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOn(false);
    setEdgeStatus("idle");
  }, []);

  const refreshCameraDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const vids = devices.filter((d) => d.kind === "videoinput");
    setCameraDevices(vids);
    if (!cameraDeviceId && vids.length > 0) {
      const preferred =
        vids.find((d) => /netum|document|sd-|scanner/i.test(d.label)) ?? vids[0];
      setCameraDeviceId(preferred.deviceId);
    }
  }, [cameraDeviceId]);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      notify.error({
        title: "Camera not supported",
        description: "Use Chrome/Edge over HTTPS or localhost.",
      });
      return;
    }
    setCameraBusy(true);
    try {
      const constraints: MediaStreamConstraints = {
        video: cameraDeviceId
          ? {
              deviceId: { exact: cameraDeviceId },
              // Prefer uncropped full-frame capture; avoid hard 16:9 assumptions.
              width: { ideal: 1920, min: 960 },
              height: { ideal: 1440, min: 720 },
              aspectRatio: { ideal: 4 / 3 },
            }
          : {
              width: { ideal: 1920, min: 960 },
              height: { ideal: 1440, min: 720 },
              aspectRatio: { ideal: 4 / 3 },
            },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      setCameraOn(true);
      await refreshCameraDevices();
    } catch (e) {
      notify.error({
        title: "Unable to open document camera",
        description: "Allow camera permission, then select your NetumScan SD camera.",
      });
      stopCamera();
      void e;
    } finally {
      setCameraBusy(false);
    }
  }, [cameraDeviceId, refreshCameraDevices, stopCamera]);

  const captureCameraFrame = useCallback(
    async (opts?: { requireValidQr?: boolean }) => {
      const video = videoRef.current;
      if (!video || !cameraOn) return false;
      const w = video.videoWidth || 1920;
      const h = video.videoHeight || 1080;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) return false;
      ctx2d.drawImage(video, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
      if (!blob) {
        notify.error({ title: "Capture failed", description: "Try again." });
        return false;
      }
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const file = new File([blob], `netum-capture-${ts}.png`, { type: "image/png" });

      if (opts?.requireValidQr) {
        const decoded = await tryDecodeQrTextFromFile(file);
        if (!decoded) {
          const now = Date.now();
          if (now > qrWarnCooldownRef.current) {
            qrWarnCooldownRef.current = now + 2500;
            notify.warning({
              title: "QR not clear yet",
              description: "Hold ballot steady and keep the full sheet in frame.",
            });
          }
          return false;
        }
        const parsed = parseBallotQrPayload(decoded);
        if (!parsed) return false;
        if (parsed.electionId !== electionId) {
          const now = Date.now();
          if (now > qrWarnCooldownRef.current) {
            qrWarnCooldownRef.current = now + 2500;
            notify.warning({
              title: "Wrong election QR",
              description: `Detected ${parsed.electionId}, expected ${electionId}.`,
            });
          }
          return false;
        }
        let orgCap: string | null = null;
        try {
          const rec = await fetchOmrLayout(parsed.ballotToken);
          const o = rec.academicOrg?.trim();
          if (o) {
            orgCap = o;
            setGovernorFilterFromBallot(o);
            console.log("AUTO ORG:", o);
          }
          if (rec.allowedContestIds?.length) {
            console.log("ALLOWED CONTEST IDS (saved layout):", rec.allowedContestIds);
          }
        } catch {
          /* no layout row yet */
        }
        if (!orgCap) {
          const v = await scannerValidate({
            electionId: parsed.electionId,
            ballotToken: parsed.ballotToken,
            templateVersion: parsed.templateVersion,
          });
          if (
            v.ok &&
            typeof v.voterDepartment === "string" &&
            v.voterDepartment.trim()
          ) {
            orgCap = v.voterDepartment.trim();
            setGovernorFilterFromBallot(orgCap);
            console.log("AUTO ORG (validate fallback):", orgCap);
          }
        }
      }

      setBatchFiles((prev) => [...prev, file]);
      notify.success({ title: "Captured", description: "Added image to queue." });
      return true;
    },
    [cameraOn, electionId]
  );

  const detectBallotFiducials = useCallback((video: HTMLVideoElement): boolean => {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return false;
    if (!autoCanvasRef.current) autoCanvasRef.current = document.createElement("canvas");
    const canvas = autoCanvasRef.current;
    const sampleW = 320;
    const sampleH = Math.max(180, Math.round((sampleW * vh) / vw));
    canvas.width = sampleW;
    canvas.height = sampleH;
    const ctx2d = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx2d) return false;
    ctx2d.drawImage(video, 0, 0, sampleW, sampleH);
    const { data, width, height } = ctx2d.getImageData(0, 0, sampleW, sampleH);

    const luminanceAt = (x: number, y: number): number => {
      const i = (y * width + x) * 4;
      return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    };

    const isDarkSquareAt = (cxNorm: number, cyNorm: number): boolean => {
      const cx = Math.round(width * cxNorm);
      const cy = Math.round(height * cyNorm);
      const half = Math.max(4, Math.round(Math.min(width, height) * 0.02));
      const x0 = Math.max(0, cx - half);
      const x1 = Math.min(width - 1, cx + half);
      const y0 = Math.max(0, cy - half);
      const y1 = Math.min(height - 1, cy + half);
      let dark = 0;
      let total = 0;
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          total += 1;
          if (luminanceAt(x, y) < 85) dark += 1;
        }
      }
      return total > 0 && dark / total > 0.42;
    };

    // Uses SquareFiducials layout from PrintableBallotSheet (left/right top/mid/bottom).
    // 8 fiducials on the scan frame: TL, TM, TR, LM, RM, BL, BM, BR.
    const frameAnchors: Array<[number, number]> = [
      [0.0, 0.0],
      [0.5, 0.0],
      [1.0, 0.0],
      [0.0, 0.5],
      [1.0, 0.5],
      [0.0, 1.0],
      [0.5, 1.0],
      [1.0, 1.0],
    ];
    const hits = frameAnchors.reduce(
      (acc, [x, y]) => acc + (isDarkSquareAt(x, y) ? 1 : 0),
      0
    );
    return hits >= 6;
  }, []);

  useEffect(() => {
    if (!cameraOn) {
      if (overlayRunRef.current !== null) {
        cancelAnimationFrame(overlayRunRef.current);
        overlayRunRef.current = null;
      }
      const canvas = overlayCanvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const frameAnchors: Array<[number, number]> = [
      [0.0, 0.0],
      [0.5, 0.0],
      [1.0, 0.0],
      [0.0, 0.5],
      [1.0, 0.5],
      [0.0, 1.0],
      [0.5, 1.0],
      [1.0, 1.0],
    ];

    const loop = () => {
      const video = videoRef.current;
      const canvas = overlayCanvasRef.current;
      if (!video || !canvas || !cameraOn) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const rect = video.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.clearRect(0, 0, w, h);

      // Probe anchor points against downsampled frame using the same detector canvas.
      let detectedHits = 0;
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        if (!autoCanvasRef.current) autoCanvasRef.current = document.createElement("canvas");
        const sample = autoCanvasRef.current;
        const sampleW = 320;
        const sampleH = Math.max(180, Math.round((sampleW * video.videoHeight) / video.videoWidth));
        sample.width = sampleW;
        sample.height = sampleH;
        const sctx = sample.getContext("2d", { willReadFrequently: true });
        if (sctx) {
          sctx.drawImage(video, 0, 0, sampleW, sampleH);
          const { data, width, height } = sctx.getImageData(0, 0, sampleW, sampleH);
          const luminanceAt = (x: number, y: number): number => {
            const i = (y * width + x) * 4;
            return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          };
          const isDarkSquareAt = (cxNorm: number, cyNorm: number): boolean => {
            const cx = Math.round(width * cxNorm);
            const cy = Math.round(height * cyNorm);
            const half = Math.max(4, Math.round(Math.min(width, height) * 0.02));
            const x0 = Math.max(0, cx - half);
            const x1 = Math.min(width - 1, cx + half);
            const y0 = Math.max(0, cy - half);
            const y1 = Math.min(height - 1, cy + half);
            let dark = 0;
            let total = 0;
            for (let y = y0; y <= y1; y += 1) {
              for (let x = x0; x <= x1; x += 1) {
                total += 1;
                if (luminanceAt(x, y) < 85) dark += 1;
              }
            }
            return total > 0 && dark / total > 0.42;
          };

          // Estimate current paper rectangle from bright region (works well for white sheet
          // over dark desk/background), then refine using fiducial probes.
          const brightThreshold = 168;
          let minX = width;
          let minY = height;
          let maxX = 0;
          let maxY = 0;
          let brightCount = 0;
          for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
              if (luminanceAt(x, y) >= brightThreshold) {
                brightCount += 1;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
          }
          const hasPaperBox = brightCount > width * height * 0.12 && maxX > minX && maxY > minY;
          const bx0 = hasPaperBox ? minX : Math.round(width * 0.05);
          const by0 = hasPaperBox ? minY : Math.round(height * 0.06);
          const bx1 = hasPaperBox ? maxX : Math.round(width * 0.95);
          const by1 = hasPaperBox ? maxY : Math.round(height * 0.94);
          const bw = Math.max(1, bx1 - bx0);
          const bh = Math.max(1, by1 - by0);

          const locateDarkSquareNear = (
            ex: number,
            ey: number,
            rx: number,
            ry: number
          ): { x: number; y: number; score: number } | null => {
            const xStart = Math.max(4, Math.round(ex - rx));
            const xEnd = Math.min(width - 5, Math.round(ex + rx));
            const yStart = Math.max(4, Math.round(ey - ry));
            const yEnd = Math.min(height - 5, Math.round(ey + ry));
            let best: { x: number; y: number; score: number } | null = null;
            const patch = 4;
            for (let yy = yStart; yy <= yEnd; yy += 2) {
              for (let xx = xStart; xx <= xEnd; xx += 2) {
                let dark = 0;
                let total = 0;
                for (let py = yy - patch; py <= yy + patch; py += 1) {
                  for (let px = xx - patch; px <= xx + patch; px += 1) {
                    total += 1;
                    if (luminanceAt(px, py) < 95) dark += 1;
                  }
                }
                const score = total > 0 ? dark / total : 0;
                if (!best || score > best.score) {
                  best = { x: xx, y: yy, score };
                }
              }
            }
            return best && best.score >= 0.26 ? best : null;
          };

          const foundAnchors: Array<{ x: number; y: number; hit: boolean }> = [];
          const probeRx = Math.max(12, Math.round(bw * 0.09));
          const probeRy = Math.max(12, Math.round(bh * 0.09));
          for (const [fx, fy] of frameAnchors) {
            const ex = bx0 + bw * fx;
            const ey = by0 + bh * fy;
            const best = locateDarkSquareNear(ex, ey, probeRx, probeRy);
            if (best) {
              detectedHits += 1;
              foundAnchors.push({ x: best.x, y: best.y, hit: true });
            } else {
              foundAnchors.push({ x: ex, y: ey, hit: false });
            }
          }

          // Build paper frame from detected fiducials when available.
          let frameX0 = bx0;
          let frameY0 = by0;
          let frameX1 = bx1;
          let frameY1 = by1;
          const foundOnly = foundAnchors.filter((a) => a.hit);
          if (foundOnly.length >= 4) {
            frameX0 = Math.min(...foundOnly.map((p) => p.x));
            frameY0 = Math.min(...foundOnly.map((p) => p.y));
            frameX1 = Math.max(...foundOnly.map((p) => p.x));
            frameY1 = Math.max(...foundOnly.map((p) => p.y));
          }

          // Enforce A4 proportion so width tracks actual paper size (prevents over-wide boxes).
          const fw0 = Math.max(1, frameX1 - frameX0);
          const fh0 = Math.max(1, frameY1 - frameY0);
          const cx = (frameX0 + frameX1) / 2;
          const cy = (frameY0 + frameY1) / 2;
          const isLandscape = fw0 > fh0;
          const targetRatio = isLandscape ? 297 / 210 : 210 / 297; // width / height
          let fw = fw0;
          let fh = fh0;
          const currentRatio = fw0 / fh0;
          if (currentRatio > targetRatio) {
            fw = fh0 * targetRatio;
          } else {
            fh = fw0 / targetRatio;
          }
          frameX0 = Math.max(0, cx - fw / 2);
          frameX1 = Math.min(width - 1, cx + fw / 2);
          frameY0 = Math.max(0, cy - fh / 2);
          frameY1 = Math.min(height - 1, cy + fh / 2);

          // Draw corrected paper rectangle.
          const rx0 = (frameX0 / width) * w;
          const ry0 = (frameY0 / height) * h;
          const rw = ((frameX1 - frameX0) / width) * w;
          const rh = ((frameY1 - frameY0) / height) * h;
          ctx.strokeStyle = detectedHits >= 6 ? "#22c55e" : "#f59e0b";
          ctx.lineWidth = 2;
          ctx.strokeRect(rx0, ry0, rw, rh);

          // Draw anchor markers snapped to refined frame.
          for (const [i, { hit }] of foundAnchors.entries()) {
            const [fx, fy] = frameAnchors[i];
            const ax = frameX0 + (frameX1 - frameX0) * fx;
            const ay = frameY0 + (frameY1 - frameY0) * fy;
            const px = (ax / width) * w;
            const py = (ay / height) * h;
            ctx.beginPath();
            ctx.arc(px, py, 8, 0, Math.PI * 2);
            ctx.fillStyle = hit ? "rgba(34,197,94,0.9)" : "rgba(239,68,68,0.85)";
            ctx.fill();
            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }

          if (showLiveBubbleOverlay) {
            // Live bubble candidate detection in the detected paper box.
            // This is a lightweight contour-based approximation for operator guidance.
            const roiW = Math.max(1, Math.round(frameX1 - frameX0));
            const roiH = Math.max(1, Math.round(frameY1 - frameY0));
            const grayRoi = new Uint8ClampedArray(roiW * roiH);
            for (let yy = 0; yy < roiH; yy += 1) {
              for (let xx = 0; xx < roiW; xx += 1) {
                grayRoi[yy * roiW + xx] = luminanceAt(
                  Math.round(frameX0) + xx,
                  Math.round(frameY0) + yy
                );
              }
            }

            // Build a temporary canvas for contour extraction.
            const contourCanvas = document.createElement("canvas");
            contourCanvas.width = roiW;
            contourCanvas.height = roiH;
            const cctx = contourCanvas.getContext("2d", { willReadFrequently: true });
            if (cctx) {
              const imgData = cctx.createImageData(roiW, roiH);
              for (let i = 0; i < grayRoi.length; i += 1) {
                const g = grayRoi[i];
                const p = i * 4;
                imgData.data[p] = g;
                imgData.data[p + 1] = g;
                imgData.data[p + 2] = g;
                imgData.data[p + 3] = 255;
              }
              cctx.putImageData(imgData, 0, 0);

              // Binary pass (dark marks and bubble outlines).
              const bin = cctx.getImageData(0, 0, roiW, roiH);
              for (let i = 0; i < bin.data.length; i += 4) {
                const g = bin.data[i];
                const v = g < 145 ? 255 : 0;
                bin.data[i] = v;
                bin.data[i + 1] = v;
                bin.data[i + 2] = v;
              }
              cctx.putImageData(bin, 0, 0);

              // Connected components via browser contours are limited;
              // use coarse sampling windows to infer likely circle centers.
              const step = Math.max(6, Math.round(Math.min(roiW, roiH) * 0.012));
              let rendered = 0;
              for (let y = step; y < roiH - step; y += step) {
                for (let x = step; x < roiW - step; x += step) {
                  const r = Math.max(4, Math.round(step * 0.75));
                  let edgeDark = 0;
                  let edgeTotal = 0;
                  let coreDark = 0;
                  let coreTotal = 0;
                  for (let a = 0; a < 360; a += 20) {
                    const rad = (a * Math.PI) / 180;
                    const ex = Math.round(x + r * Math.cos(rad));
                    const ey = Math.round(y + r * Math.sin(rad));
                    if (ex <= 0 || ey <= 0 || ex >= roiW - 1 || ey >= roiH - 1) continue;
                    edgeTotal += 1;
                    if (grayRoi[ey * roiW + ex] < 150) edgeDark += 1;
                  }
                  for (let yy = y - Math.round(r * 0.45); yy <= y + Math.round(r * 0.45); yy += 1) {
                    for (let xx = x - Math.round(r * 0.45); xx <= x + Math.round(r * 0.45); xx += 1) {
                      if (xx <= 0 || yy <= 0 || xx >= roiW - 1 || yy >= roiH - 1) continue;
                      coreTotal += 1;
                      if (grayRoi[yy * roiW + xx] < 125) coreDark += 1;
                    }
                  }
                  if (edgeTotal < 8 || coreTotal < 8) continue;
                  const edgeRatio = edgeDark / edgeTotal;
                  const coreRatio = coreDark / coreTotal;

                  // Bubble-like pattern: visible ring; fill when core is dark enough.
                  if (edgeRatio < 0.42) continue;
                  const isFilled = coreRatio > 0.32;
                  const px = ((frameX0 + x) / width) * w;
                  const py = ((frameY0 + y) / height) * h;
                  const pr = (r / width) * w;
                  ctx.beginPath();
                  ctx.arc(px, py, Math.max(4, pr), 0, Math.PI * 2);
                  ctx.strokeStyle = isFilled
                    ? "rgba(34,197,94,0.95)"
                    : "rgba(251,191,36,0.85)";
                  ctx.lineWidth = isFilled ? 2.2 : 1.4;
                  ctx.stroke();
                  if (isFilled) {
                    ctx.fillStyle = "rgba(34,197,94,0.20)";
                    ctx.fill();
                  }
                  rendered += 1;
                  if (rendered > 180) break;
                }
                if (rendered > 180) break;
              }
            }
          }
        }
      }

      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(8, 8, 148, 24);
      ctx.fillStyle = "#fff";
      ctx.font = "12px sans-serif";
      ctx.fillText(`Fiducials: ${detectedHits}/8`, 14, 24);

      overlayRunRef.current = requestAnimationFrame(loop);
    };

    overlayRunRef.current = requestAnimationFrame(loop);
    return () => {
      if (overlayRunRef.current !== null) {
        cancelAnimationFrame(overlayRunRef.current);
        overlayRunRef.current = null;
      }
    };
  }, [cameraOn, edgeStatus]);

  useEffect(() => {
    if (!cameraOn || !autoCapture) {
      if (cameraOn) setEdgeStatus("idle");
      if (autoRunRef.current !== null) {
        cancelAnimationFrame(autoRunRef.current);
        autoRunRef.current = null;
      }
      stableFramesRef.current = 0;
      capturedForCurrentPresenceRef.current = false;
      return;
    }
    const loop = () => {
      const video = videoRef.current;
      if (!video || !cameraOn || !autoCapture) return;
      const now = Date.now();
      const fiducialsFound = detectBallotFiducials(video);
      if (fiducialsFound) {
        stableFramesRef.current += 1;
        setEdgeStatus("detected");
      } else {
        stableFramesRef.current = 0;
        capturedForCurrentPresenceRef.current = false;
        setEdgeStatus("searching");
      }
      if (
        stableFramesRef.current >= 6 &&
        !capturedForCurrentPresenceRef.current &&
        now > captureCooldownRef.current
      ) {
        captureCooldownRef.current = now + 1800;
        stableFramesRef.current = 0;
        void (async () => {
          const ok = await captureCameraFrame({ requireValidQr: true });
          if (ok) {
            capturedForCurrentPresenceRef.current = true;
            setEdgeStatus("captured");
          } else {
            capturedForCurrentPresenceRef.current = false;
            setEdgeStatus("searching");
          }
        })();
      }
      autoRunRef.current = requestAnimationFrame(loop);
    };
    autoRunRef.current = requestAnimationFrame(loop);
    return () => {
      if (autoRunRef.current !== null) {
        cancelAnimationFrame(autoRunRef.current);
        autoRunRef.current = null;
      }
    };
  }, [autoCapture, cameraOn, captureCameraFrame, detectBallotFiducials]);

  useEffect(() => {
    void refreshCameraDevices();
    return () => {
      stopCamera();
    };
  }, [refreshCameraDevices, stopCamera]);

  const handleExportTemplate = async () => {
    if (!electionId) {
      notify.error({ title: "Select an election first" });
      return;
    }
    if (!omGeometryTemplate) {
      notify.error({
        title: "Template not ready",
        description: "Wait for ballot geometry to finish measuring (see OMR geometry status below).",
      });
      return;
    }
    setExporting(true);
    try {
      downloadJson(
        `scanner-template-${electionId}.json`,
        scannerTemplateFromGeometry(omGeometryTemplate)
      );
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
    if (!omGeometryTemplate) {
      notify.error({
        title: "Scanner geometry not ready",
        description:
          "Wait for “OMR geometry: Ready” (ballot preview below), or reload after contests load.",
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
        if (v.error === "TOKEN_USED") {
          ballots.push({
            fileName: file.name,
            scanOk: true,
            source: "client",
            message: "Already counted earlier (token already used).",
            ballotToken: payload.ballotToken,
            qr: payload,
            selectionsByPosition: {},
            tokenValidation: { ok: false, error: v.error },
          });
          return;
        }
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

    const readClientQrPayload = async (file: File) => {
      const decoded = await tryDecodeQrTextFromFile(file);
      if (!decoded) return null;
      const payload = parseBallotQrPayload(decoded);
      if (!payload) return null;
      if (payload.electionId !== electionId) return null;
      return payload;
    };

    try {
      let pos = positions;
      if (!pos.length) {
        pos = await fetchPositions(electionId);
        setPositions(pos);
      }
      const scannerTemplateExport = scannerTemplateFromGeometry(omGeometryTemplate);
      const scannerTemplate = scannerTemplateFromGeometry(omGeometryTemplate);
      logScannerTemplateContestIds(scannerTemplate);

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
              // If OpenCV could not decode QR but browser QR can, salvage the row.
              const fallbackQr = await readClientQrPayload(file);
              if (fallbackQr) {
                const fallbackTv = await scannerValidate({
                  electionId: fallbackQr.electionId,
                  ballotToken: fallbackQr.ballotToken,
                  templateVersion: fallbackQr.templateVersion,
                });
                if (fallbackTv.ok) {
                  ballots.push({
                    fileName: r.fileName,
                    scanOk: true,
                    source: "omr",
                    message:
                      (omr["warpApplied"] ? "Fiducial warp applied. " : "") +
                      "OMR QR unreadable; token validated via browser QR fallback. " +
                      formatMarksLine(sbp),
                    ballotToken: fallbackQr.ballotToken,
                    qr: fallbackQr,
                    selectionsByPosition: sbp,
                    rawBubbleScores: rawScores,
                    selectionsFlat: flat,
                    warpApplied: omr["warpApplied"] === true,
                    tokenValidation: {
                      ok: true,
                      templateVersion: fallbackTv.templateVersion,
                    },
                    omrWorkerPayload: omr,
                  });
                  continue;
                }
                if (fallbackTv.error === "TOKEN_USED") {
                  ballots.push({
                    fileName: r.fileName,
                    scanOk: true,
                    source: "omr",
                    message:
                      (omr["warpApplied"] ? "Fiducial warp applied. " : "") +
                      "OMR QR unreadable; token already counted (browser QR fallback).",
                    ballotToken: fallbackQr.ballotToken,
                    qr: fallbackQr,
                    selectionsByPosition: sbp,
                    rawBubbleScores: rawScores,
                    selectionsFlat: flat,
                    warpApplied: omr["warpApplied"] === true,
                    tokenValidation: { ok: false, error: fallbackTv.error },
                    omrWorkerPayload: omr,
                  });
                  continue;
                }
                ballots.push({
                  fileName: r.fileName,
                  scanOk: false,
                  source: "omr",
                  message:
                    (omr["warpApplied"] ? "Fiducial warp applied. " : "") +
                    `OMR QR unreadable; browser QR fallback failed: ${friendlyValidateError(fallbackTv.error)}.`,
                  ballotToken: fallbackQr.ballotToken,
                  qr: fallbackQr,
                  selectionsByPosition: sbp,
                  rawBubbleScores: rawScores,
                  selectionsFlat: flat,
                  warpApplied: omr["warpApplied"] === true,
                  tokenValidation: { ok: false, error: fallbackTv.error },
                  omrWorkerPayload: omr,
                });
                continue;
              }
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
              if (err === "TOKEN_USED") {
                ballots.push({
                  fileName: r.fileName,
                  scanOk: true,
                  source: "omr",
                  message:
                    (omr["warpApplied"] ? "Fiducial warp applied. " : "") +
                    "Already counted earlier (token already used).",
                  ballotToken: qr?.ballotToken,
                  qr: qr ?? undefined,
                  selectionsByPosition: sbp,
                  rawBubbleScores: rawScores,
                  selectionsFlat: flat,
                  warpApplied: omr["warpApplied"] === true,
                  tokenValidation: tv,
                  omrWorkerPayload: omr,
                });
                continue;
              }
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
        scannerTemplate: scannerTemplateExport,
        ballots,
      });
      if (exportPayload.ballots.length === 0) {
        exportPayload.ballots.push({
          fileName: "scan-run",
          scanOk: false,
          source: "client",
          message: "No scan rows produced. Check OMR worker connectivity and try again.",
          selectionsByPosition: {},
        });
      }

      const validCount = ballots.filter((b) => b.scanOk).length;
      const alreadyCounted = ballots.filter((b) =>
        isTokenUsedValidation(b.tokenValidation)
      ).length;
      const batchId = `batch-${Date.now()}`;
      setScanHistory((h) => [
        {
          id: batchId,
          at: exportPayload.generatedAt,
          electionLabel: label,
          export: exportPayload,
          validCount,
          errorCount: exportPayload.ballots.length - validCount,
        },
        ...h,
      ]);
      setBatchFiles([]);

      const errC = ballots.length - validCount;
      if (errC === 0) {
        notify.success({
          title: "Scan complete",
          description:
            alreadyCounted > 0
              ? `${validCount} file(s), including ${alreadyCounted} already-counted token(s). Use “Download raw JSON” for full data.`
              : `${validCount} file(s). Use “Download raw JSON” for full data.`,
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
      const msg = String(e);
      // Preserve operator visibility: even when scan pipeline throws, create a batch row
      // so "Results & raw export" is not empty and raw diagnostics remain downloadable.
      const exportPayload = buildScanExportBatch({
        electionId,
        electionName: label,
        ballotTemplateVersion: BALLOT_TEMPLATE_VERSION,
        scannerTemplate: {},
        ballots: filesToScan.map((f) => ({
          fileName: f.name,
          scanOk: false,
          source: "client" as const,
          message: `Scan pipeline error: ${msg}`,
          selectionsByPosition: {},
        })),
      });
      const batchId = `batch-${Date.now()}`;
      setScanHistory((h) => [
        {
          id: batchId,
          at: exportPayload.generatedAt,
          electionLabel: label,
          export: exportPayload,
          validCount: 0,
          errorCount: exportPayload.ballots.length,
        },
        ...h,
      ]);
      notify.error({ title: "Scan failed", description: msg });
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
                        {positions.length} contest(s) loaded — preview uses{" "}
                        {positionsForPreview.length} after org filter (must match printed ballot).
                      </p>
                    ) : null}
                  </div>

                  {electionId && positions.length > 0 ? (
                    <div className="rounded-md border border-dashed border-muted bg-muted/30 p-3 space-y-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">Governor row (academic org)</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {previewAllGovernors ? (
                            <>
                              Showing <strong>all</strong> governor contests (
                              <code className="rounded bg-muted px-1">?allGovernors=1</code>). Remove
                              that flag to use the QR-linked org once a ballot image is in the queue.
                            </>
                          ) : urlGovernorOverride ? (
                            <>
                              Using URL override{" "}
                              <code className="rounded bg-muted px-1">
                                ?department={urlGovernorOverride}
                              </code>{" "}
                              (same as ballot print).
                            </>
                          ) : governorFilterFromBallot ? (
                            <>
                              From issued ballot QR:{" "}
                              <strong className="text-foreground">{governorFilterFromBallot}</strong>
                              . Matches the printed sheet for that token; the OMR worker still loads
                              per-ballot layout from the gateway when configured.
                            </>
                          ) : (
                            <>
                              Add a ballot image (or use auto-capture): the first decodable QR sets
                              the org from the roster. For a manual preview without a QR, use{" "}
                              <code className="rounded bg-muted px-1">?department=Clovers</code> (etc.)
                              or list every governor with{" "}
                              <code className="rounded bg-muted px-1">?allGovernors=1</code>.
                            </>
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">OMR layout (required for scan / debug)</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Geometry:{" "}
                          {omGeometryTemplate ? (
                            <span className="font-medium text-emerald-800">Ready</span>
                          ) : (
                            <span className="text-amber-800">Measuring ballot preview…</span>
                          )}{" "}
                          — voter-specific grid (v2), not election-wide.
                        </p>
                        <div className="pointer-events-none fixed left-[-10000px] top-0 z-0 w-[210mm] bg-white">
                          <PrintableBallotSheet
                            key={`${electionId}-${includeAbstain}-${effectiveGovernorFilter}`}
                            electionId={electionId}
                            ballotToken={buildPreviewBallotToken(electionId)}
                            templateVersion={BALLOT_TEMPLATE_VERSION}
                            electionName={electionName || electionId}
                            positions={printablePositions}
                            showAbstain={includeAbstain}
                            onGeometryTemplateReady={(geom) => {
                              console.log(
                                "SCANNER PREVIEW GEOMETRY CONTEST IDS:",
                                geom.contests.map((c) => c.positionId),
                              );
                              setOmGeometryTemplate(geom);
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}

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

                  <div className="rounded-md border bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900">
                        Use document camera (NetumScan SD)
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {!cameraOn ? (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={!electionId || cameraBusy}
                            onClick={() => void startCamera()}
                          >
                            {cameraBusy ? "Opening…" : "Start camera"}
                          </Button>
                        ) : (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              disabled={cameraBusy}
                              onClick={() =>
                                void captureCameraFrame({ requireValidQr: true })
                              }
                            >
                              Capture to queue
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              disabled={cameraBusy}
                              onClick={stopCamera}
                            >
                              Stop camera
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    {cameraDevices.length > 1 && (
                      <div className="mt-2">
                        <label className="mb-1 block text-xs text-muted-foreground">
                          Camera device
                        </label>
                        <select
                          className="h-9 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm"
                          value={cameraDeviceId}
                          onChange={(e) => setCameraDeviceId(e.target.value)}
                          disabled={cameraOn}
                        >
                          {cameraDevices.map((d) => (
                            <option key={d.deviceId} value={d.deviceId}>
                              {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="relative mt-3 overflow-hidden rounded border bg-black/90">
                      <video
                        ref={videoRef}
                        className={`mx-auto max-h-[36rem] w-full max-w-xl object-contain ${
                          cameraPreviewTopAlign ? "object-top" : "object-center"
                        }`}
                        playsInline
                        muted
                        autoPlay
                      />
                      <canvas
                        ref={overlayCanvasRef}
                        className={`pointer-events-none absolute inset-0 mx-auto max-h-[36rem] w-full max-w-xl object-contain ${
                          cameraPreviewTopAlign ? "object-top" : "object-center"
                        }`}
                        aria-hidden
                      />
                    </div>
                    {cameraOn && (
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={autoCapture}
                            onChange={(e) => setAutoCapture(e.target.checked)}
                          />
                          Auto-capture using SquareFiducials
                        </label>
                        <span className="text-xs text-muted-foreground">
                          Status:{" "}
                          {edgeStatus === "idle"
                            ? "idle"
                            : edgeStatus === "searching"
                              ? "searching for fiducials"
                              : edgeStatus === "detected"
                                ? "fiducials detected"
                                : "captured"}
                        </span>
                        <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={showLiveBubbleOverlay}
                            onChange={(e) => setShowLiveBubbleOverlay(e.target.checked)}
                          />
                          Live encircle detection overlay
                        </label>
                        <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={cameraPreviewTopAlign}
                            onChange={(e) => setCameraPreviewTopAlign(e.target.checked)}
                          />
                          Align camera preview to top
                        </label>
                      </div>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      Keep the full ballot in frame. Auto-capture triggers once per detected
                      ballot and only queues QR-valid images.
                    </p>
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
                      disabled={
                        !electionId ||
                        batchFiles.length === 0 ||
                        isScanning ||
                        !omGeometryTemplate
                      }
                      onClick={() => void runScanBatch()}
                    >
                      {isScanning ? "Scanning…" : "Scan ballots"}
                    </Button>
                    {batchFiles.length > 0 && (
                      <Button type="button" variant="outline" onClick={() => setBatchFiles([])}>
                        Clear queue
                      </Button>
                    )}
                    {batchFiles.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={debugOverlayBusy || !omGeometryTemplate}
                        onClick={() => void previewDebugOverlay()}
                      >
                        {debugOverlayBusy ? "Rendering overlay…" : "Preview OpenCV overlay"}
                      </Button>
                    )}
                  </div>

                  {debugOverlayImage && (
                    <div className="rounded-md border bg-white p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-900">
                          OpenCV contour/rectangle preview
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {debugOverlayMeta?.fileName ?? "file"} · detected contests{" "}
                          {debugOverlayMeta?.contestsDetected ?? "?"}/
                          {debugOverlayMeta?.contestsInTemplate ?? "?"}
                        </p>
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={debugOverlayImage}
                        alt="OpenCV debug overlay"
                        className="mx-auto max-h-[520px] w-full rounded border object-contain"
                      />
                    </div>
                  )}
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
                      disabled={!electionId || exporting || !omGeometryTemplate}
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
