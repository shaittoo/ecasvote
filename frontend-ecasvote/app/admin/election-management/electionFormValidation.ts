import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { phtDateAndTimeToIso } from "./electionEditHelpers";

type ValidationInput = {
  title: string;
  academicYear: string;
  semester: string;
  durationRange: DateRange | undefined;
  startTime: string;
  endTime: string;
  status?: "DRAFT" | "OPEN" | "CLOSED";
  mode?: "create" | "edit";
};

type ValidationResult =
  | { ok: true; startTimeIso: string; endTimeIso: string }
  | { ok: false; title: string; description: string };

const MIN_OVERNIGHT_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const CREATE_LEAD_TIME_MS = 60 * 60 * 1000; // 1 hour

function parseAcademicYear(academicYear: string): { start: number; end: number } | null {
  const match = academicYear.match(/(\d{4})\s*-\s*(\d{4})/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end !== start + 1) return null;
  return { start, end };
}

function monthInAllowedRange(month: number, semester: string): boolean {
  const normalized = semester.trim().toLowerCase();
  // JS months: Jan=1 ... Dec=12
  if (normalized === "first semester") return month >= 8 && month <= 12; // Aug-Dec
  if (normalized === "second semester") return month >= 1 && month <= 6; // Jan-Jun
  if (normalized === "midyear") return month >= 6 && month <= 8; // Jun-Aug
  return true;
}

export function validateElectionForm(input: ValidationInput): ValidationResult {
  const {
    title,
    academicYear,
    semester,
    durationRange,
    startTime,
    endTime,
    status,
    mode = "edit",
  } = input;

  if (!title || !durationRange?.from || !durationRange?.to || !startTime || !endTime) {
    return {
      ok: false,
      title: "Missing fields",
      description: "Title, election date range, and start/end times are required.",
    };
  }

  const parsedAy = parseAcademicYear(academicYear);
  if (!parsedAy) {
    return {
      ok: false,
      title: "Invalid academic year",
      description: "Academic year must follow YYYY - YYYY and span exactly one year.",
    };
  }

  const startDatePart = format(durationRange.from, "yyyy-MM-dd");
  const endDatePart = format(durationRange.to, "yyyy-MM-dd");
  const startMonth = Number(startDatePart.slice(5, 7));
  const endMonth = Number(endDatePart.slice(5, 7));
  const startYear = Number(startDatePart.slice(0, 4));
  const endYear = Number(endDatePart.slice(0, 4));
  if (![parsedAy.start, parsedAy.end].includes(startYear) || ![parsedAy.start, parsedAy.end].includes(endYear)) {
    return {
      ok: false,
      title: "Date outside academic year",
      description: "Start and end dates must fall within the selected academic year.",
    };
  }
  if (!monthInAllowedRange(startMonth, semester) || !monthInAllowedRange(endMonth, semester)) {
    return {
      ok: false,
      title: "Semester/date mismatch",
      description:
        semester === "First Semester"
          ? "First Semester dates must be between August and December."
          : semester === "Second Semester"
            ? "Second Semester dates must be between January and June."
            : "Selected dates do not match the allowed months for this semester.",
    };
  }

  const startTimeIso = phtDateAndTimeToIso(startDatePart, startTime);
  const endTimeIso = phtDateAndTimeToIso(endDatePart, endTime);
  if (!startTimeIso || !endTimeIso) {
    return {
      ok: false,
      title: "Invalid date/time",
      description: "Please select a valid election date range and time values.",
    };
  }

  const startMs = new Date(startTimeIso).getTime();
  const endMs = new Date(endTimeIso).getTime();
  const nowMs = Date.now();

  if (startMs < nowMs) {
    return {
      ok: false,
      title: "Invalid start date",
      description: "Election start date & time must not be earlier than the current date & time.",
    };
  }
  if (mode === "create" && startMs - nowMs < CREATE_LEAD_TIME_MS) {
    return {
      ok: false,
      title: "Start time too soon",
      description: "Election must be created at least 1 hour before the start time.",
    };
  }
  if (startMs >= endMs) {
    return {
      ok: false,
      title: "Invalid duration",
      description: "End date & time must be after start date & time.",
    };
  }

  if (startDatePart === endDatePart && endTime <= startTime) {
    return {
      ok: false,
      title: "Invalid same-day time range",
      description: "For the same day, end time must be strictly greater than start time.",
    };
  }

  const spansMultipleDays = endDatePart > startDatePart;
  if (spansMultipleDays && endMs - startMs < MIN_OVERNIGHT_DURATION_MS) {
    return {
      ok: false,
      title: "Invalid overnight duration",
      description:
        "For multi-day ranges, duration must be at least 30 minutes to avoid invalid overnight edge cases.",
    };
  }

  if (status) {
    if (status === "OPEN" && nowMs < startMs) {
      return {
        ok: false,
        title: "Invalid status timing",
        description: "An election before its start time should remain DRAFT, not OPEN.",
      };
    }
    if (status !== "CLOSED" && nowMs > endMs) {
      return {
        ok: false,
        title: "Invalid status timing",
        description: "An election past its end time should be CLOSED.",
      };
    }
  }

  return { ok: true, startTimeIso, endTimeIso };
}

