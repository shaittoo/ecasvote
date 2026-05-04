import type { Election } from "@/lib/ecasvoteApi";

const statusRank = (s: Election["status"]) =>
  s === "OPEN" ? 0 : s === "CLOSED" ? 1 : 2;

/** OPEN elections first, then newest by start time; then CLOSED / DRAFT by start time. */
export function sortElectionsForStudentSelect(elections: Election[]): Election[] {
  return [...elections].sort((a, b) => {
    const r = statusRank(a.status) - statusRank(b.status);
    if (r !== 0) return r;
    return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
  });
}

/**
 * Prefer the most recently started OPEN election; otherwise first CLOSED, else first in list.
 */
export function pickDefaultStudentElection(elections: Election[]): Election | null {
  if (!elections.length) return null;
  const open = elections.filter((e) => e.status === "OPEN");
  if (open.length > 0) {
    open.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    return open[0] ?? null;
  }
  const closed = elections.find((e) => e.status === "CLOSED");
  return closed ?? elections[0] ?? null;
}
