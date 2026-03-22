/**
 * Parse admin-uploaded voter roster CSV → gateway /voters/import payload.
 * Expected columns (header row, flexible names — see HEADER_TO_FIELD).
 */

import type { VoterImportPayload } from "./ecasvoteApi";

/** Comma-separated line; supports quoted fields with commas inside */
export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      result.push(stripQuotes(cur.trim()));
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(stripQuotes(cur.trim()));
  return result;
}

function stripQuotes(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/""/g, '"');
  }
  return s;
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * Map normalized header → row key.
 * - yearLevelRaw: text before parsing to a number (e.g. "4", "3rd Year")
 * - Columns like semester / academic_year are unmapped and ignored
 */
const HEADER_TO_FIELD: Record<string, string> = {
  student_number: "studentNumber",
  studentnumber: "studentNumber",
  student_id: "studentNumber",
  id: "studentNumber",
  up_email: "upEmail",
  email: "upEmail",
  up_mail: "upEmail",
  full_name: "fullName",
  name: "fullName",
  college: "college",
  department: "department",
  dept: "department",
  academic_org: "department",
  academic_organization: "department",
  org: "department",
  program: "program",
  degree_program: "program",
  course: "program",
  year_level: "yearLevelRaw",
  yearlevel: "yearLevelRaw",
  year: "yearLevelRaw",
  status: "status",
  enrollment_status: "status",
  enrollment: "status",
  is_eligible: "isEligible",
  eligible: "isEligible",
};

function parseYearLevel(raw: string): number {
  const t = raw.trim();
  if (!t) throw new Error("year level is empty");
  const m = t.match(/\d+/);
  if (!m) throw new Error(`invalid year level: "${raw}"`);
  const n = parseInt(m[0], 10);
  if (n < 1 || n > 20) throw new Error(`year level out of range: "${raw}"`);
  return n;
}

function parseBool(raw: string | undefined): boolean {
  if (raw === undefined || raw === "") return true;
  const s = String(raw).trim().toLowerCase();
  if (["false", "0", "no", "n"].includes(s)) return false;
  return true;
}

/** Align with Prisma voter.status (e.g. ENROLLED, LOA) */
function normalizeEnrollmentStatus(raw: string): string {
  const t = raw.trim();
  if (!t) return "ENROLLED";
  let u = t.toUpperCase().replace(/[\s-]+/g, "_");
  if (u === "ENROLLED" || u.startsWith("ENROLLED_")) u = "ENROLLED";
  return u;
}

function detectDelimiter(headerLine: string): "," | "\t" | ";" {
  const tabs = (headerLine.match(/\t/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  const semis = (headerLine.match(/;/g) || []).length;
  if (tabs > 0 && tabs >= commas && tabs >= semis) return "\t";
  if (semis > commas && semis > tabs) return ";";
  return ",";
}

/** Split one data row using comma (quoted), tab, or semicolon */
function parseDelimitedLine(
  line: string,
  delimiter: "," | "\t" | ";"
): string[] {
  if (delimiter === "\t") {
    return line.split("\t").map((c) => stripQuotes(c.trim()));
  }
  if (delimiter === ";") {
    return line.split(";").map((c) => stripQuotes(c.trim()));
  }
  return parseCsvLine(line);
}

export type ParseVoterCsvResult = {
  rows: VoterImportPayload[];
  /** Rows skipped during parse (bad year level, missing fields, etc.) */
  skipped: Array<{ line: number; reason: string }>;
};

/**
 * Parse CSV/TSV text into import rows.
 * - Strips UTF-8 BOM (common for Excel exports)
 * - Pads short rows so columns stay aligned with the header
 * - Skips bad rows and reports line numbers instead of failing the whole file
 */
export function parseVoterCsv(text: string): ParseVoterCsvResult {
  const raw = text.replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error("File needs a header row and at least one data row.");
  }

  const delimiter = detectDelimiter(lines[0]);
  const headerCells = parseDelimitedLine(lines[0], delimiter);
  const headerLen = headerCells.length;
  const fieldNames = headerCells.map((h) => {
    const n = normalizeHeader(h);
    return HEADER_TO_FIELD[n] ?? null;
  });

  if (!fieldNames.some((f) => f === "studentNumber")) {
    throw new Error(
      "Missing a student id column (e.g. student_id). If the file is from Excel, save as CSV UTF-8 and ensure the first row is headers."
    );
  }

  const rows: VoterImportPayload[] = [];
  const skipped: Array<{ line: number; reason: string }> = [];

  for (let li = 1; li < lines.length; li++) {
    const lineNo = li + 1;
    let cells = parseDelimitedLine(lines[li], delimiter);
    if (cells.every((c) => !c.trim())) continue;

    while (cells.length < headerLen) {
      cells.push("");
    }
    if (cells.length > headerLen) {
      cells = cells.slice(0, headerLen);
    }

    try {
      const row: Record<string, string> = {};
      fieldNames.forEach((fn, idx) => {
        if (fn) row[fn] = cells[idx] ?? "";
      });

      const yearRaw = row.yearLevelRaw ?? "";
      const yearLevel = parseYearLevel(String(yearRaw));

      const college = String(row.college ?? "").trim();
      let department = String(row.department ?? "").trim();
      if (!department && college) {
        department = college;
      }

      const payload: VoterImportPayload = {
        studentNumber: String(row.studentNumber ?? "").trim(),
        upEmail: String(row.upEmail ?? "").trim(),
        fullName: String(row.fullName ?? "").trim(),
        college,
        department,
        program: String(row.program ?? "").trim(),
        yearLevel,
        status: normalizeEnrollmentStatus(row.status ?? ""),
        isEligible: parseBool(row.isEligible),
      };

      if (
        !payload.studentNumber ||
        !payload.upEmail ||
        !payload.fullName ||
        !payload.college ||
        !payload.department ||
        !payload.program
      ) {
        skipped.push({
          line: lineNo,
          reason:
            "Missing required value (student_id, up_mail, full_name, college, program, year_level, or academic_org).",
        });
        continue;
      }

      rows.push(payload);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      skipped.push({ line: lineNo, reason: msg });
    }
  }

  if (rows.length === 0) {
    const hint = skipped[0]
      ? `First problem: line ${skipped[0].line}: ${skipped[0].reason}`
      : "No non-empty data rows.";
    throw new Error(`No valid rows to import. ${hint}`);
  }

  return { rows, skipped };
}

/** Example header row (tab-separated, matches typical registrar export) */
export const VOTER_CSV_EXAMPLE_HEADER = [
  "student_id",
  "full_name",
  "up_mail",
  "college",
  "program",
  "year_level",
  "academic_org",
  "enrollment_status",
  "semester",
  "academic_year",
].join("\t");
