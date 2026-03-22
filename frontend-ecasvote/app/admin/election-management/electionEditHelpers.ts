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
      const start = new Date(electionData.startTime);
      const end = new Date(electionData.endTime);
      startDate = start.toISOString().slice(0, 16);
      endDate = end.toISOString().slice(0, 16);
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
