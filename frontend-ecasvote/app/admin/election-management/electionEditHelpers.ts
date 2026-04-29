import { fetchElection } from "@/lib/ecasvoteApi";
import type { ElectionRow } from "./types";

export type ElectionFormFields = {
  newTitle: string;
  newAcademicYear: string;
  newSemester: string;
  newStartDate: string;
  newEndDate: string;
  newStatus: string;
};

const PH_TIME_ZONE = "Asia/Manila";

function toPhtDateTimeLocal(isoString: string): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");
  const hour = getPart("hour");
  const minute = getPart("minute");

  if (!year || !month || !day || !hour || !minute) return "";
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/**
 * Convert election duration values entered in Philippine Time to UTC ISO string.
 * Example: 2026-05-14 + 13:30 (PHT) -> 2026-05-14T05:30:00.000Z
 */
export function phtDateAndTimeToIso(dateStr: string, timeStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return "";
  }

  // PHT is UTC+08:00 with no DST; convert to UTC before serializing.
  const utcMs = Date.UTC(year, month - 1, day, hour - 8, minute, 0, 0);
  return new Date(utcMs).toISOString();
}

/** Build form state for editing an election (datetime-local + labels). */
export async function loadElectionEditFormState(
  election: ElectionRow
): Promise<ElectionFormFields> {
  const dateRange = election.startEnd?.split(" - ") || [];
  let startDate = "";
  let endDate = "";

  try {
    const electionData = await fetchElection(election.id);
    if (electionData?.startTime && electionData?.endTime) {
      startDate = toPhtDateTimeLocal(electionData.startTime);
      endDate = toPhtDateTimeLocal(electionData.endTime);
    } else if (dateRange.length === 2) {
      const start = dateRange[0].trim();
      const end = dateRange[1].trim();
      if (start && start !== "YYYY-MM-DD" && start !== "N/A") {
        try {
          const parsedStart = new Date(start);
          if (!isNaN(parsedStart.getTime())) {
            startDate = parsedStart.toISOString().slice(0, 16);
          }
        } catch {
          startDate = start;
        }
      }
      if (end && end !== "YYYY-MM-DD" && end !== "N/A") {
        try {
          const parsedEnd = new Date(end);
          if (!isNaN(parsedEnd.getTime())) {
            endDate = parsedEnd.toISOString().slice(0, 16);
          }
        } catch {
          endDate = end;
        }
      }
    }
  } catch {
    if (dateRange.length === 2) {
      const start = dateRange[0].trim();
      const end = dateRange[1].trim();
      if (start && start !== "YYYY-MM-DD" && start !== "N/A") {
        try {
          const parsedStart = new Date(start);
          if (!isNaN(parsedStart.getTime())) {
            startDate = parsedStart.toISOString().slice(0, 16);
          }
        } catch {
          startDate = start;
        }
      }
      if (end && end !== "YYYY-MM-DD" && end !== "N/A") {
        try {
          const parsedEnd = new Date(end);
          if (!isNaN(parsedEnd.getTime())) {
            endDate = parsedEnd.toISOString().slice(0, 16);
          }
        } catch {
          endDate = end;
        }
      }
    }
  }

  return {
    newTitle: election.title || "",
    newAcademicYear: election.academicYear || "2025-2026",
    newSemester: election.semester || "First Semester",
    newStartDate: startDate,
    newEndDate: endDate,
    newStatus: election.status || "Draft",
  };
}
