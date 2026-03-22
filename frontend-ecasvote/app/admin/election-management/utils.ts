import { fetchElection, fetchElections } from "@/lib/ecasvoteApi";
import type { ElectionRow } from "./types";

export function getStatusBadgeColor(status: string): string {
  switch (status?.toUpperCase()) {
    case "OPEN":
      return "bg-green-100 text-green-800";
    case "CLOSED":
      return "bg-red-100 text-red-800";
    case "DRAFT":
      return "bg-gray-100 text-gray-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

/** Load elections for the list with fresh chain data when available. */
export async function loadElectionRows(): Promise<ElectionRow[]> {
  const electionsList = await fetchElections();
  if (!electionsList?.length) return [];

  return Promise.all(
    electionsList.map(async (e) => {
      const fresh = await fetchElection(e.id).catch(() => null);
      const data = fresh || e;
      return {
        id: data.id,
        title: data.name || "Election",
        academicYear:
          new Date(data.startTime).getFullYear() +
          "-" +
          (new Date(data.startTime).getFullYear() + 1),
        semester: "First Semester",
        status: data.status || "DRAFT",
        startEnd: `${data.startTime ? new Date(data.startTime).toLocaleString("en-US", { timeZone: "Asia/Manila" }) : "N/A"} - ${data.endTime ? new Date(data.endTime).toLocaleString("en-US", { timeZone: "Asia/Manila" }) : "N/A"}`,
      };
    })
  );
}
