import type { Election } from "@/lib/ecasvoteApi";

function normalizeStatus(s: Election["status"]): string {
  return String(s ?? "")
    .trim()
    .toUpperCase();
}

const statusRank = (s: Election["status"]) => {
  const u = normalizeStatus(s);
  return u === "OPEN" ? 0 : u === "CLOSED" ? 1 : 2;
};

/** True when election is OPEN and current time is within [startTime, endTime]. */
function isOngoingBySchedule(e: Election, nowMs: number): boolean {
  if (normalizeStatus(e.status) !== "OPEN") return false;
  const start = new Date(e.startTime).getTime();
  const end = new Date(e.endTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return nowMs >= start && nowMs <= end;
}

/**
 * OPEN first; among OPEN, ongoing (in schedule window) before OPEN-but-outside-window;
 * then newest startTime. CLOSED / DRAFT follow with same startTime ordering within rank.
 */
export function sortElectionsForStudentSelect(elections: Election[]): Election[] {
  const now = Date.now();
  return [...elections].sort((a, b) => {
    const r = statusRank(a.status) - statusRank(b.status);
    if (r !== 0) return r;
    const ongoingA = isOngoingBySchedule(a, now) ? 0 : 1;
    const ongoingB = isOngoingBySchedule(b, now) ? 0 : 1;
    const og = ongoingA - ongoingB;
    if (og !== 0) return og;
    return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
  });
}

/**
 * Prefer an OPEN election that is ongoing by schedule; otherwise any OPEN (newest start);
 * otherwise first CLOSED; else first row.
 */
export function pickDefaultStudentElection(elections: Election[]): Election | null {
  if (!elections.length) return null;
  const now = Date.now();

  const open = elections.filter((e) => normalizeStatus(e.status) === "OPEN");
  if (open.length > 0) {
    const ongoing = open.filter((e) => isOngoingBySchedule(e, now));
    const pool = ongoing.length > 0 ? ongoing : open;
    pool.sort(
      (a, b) =>
        new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );
    return pool[0] ?? null;
  }

  const closed = elections.find((e) => normalizeStatus(e.status) === "CLOSED");
  return closed ?? elections[0] ?? null;
}
