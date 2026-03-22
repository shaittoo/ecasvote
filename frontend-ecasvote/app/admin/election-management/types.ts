export type ElectionRow = {
  id: string;
  title: string;
  academicYear: string;
  semester: string;
  status: string;
  startEnd: string;
};

export type CandidateDraft = {
  position: string;
  name: string;
  party: string;
  program: string;
  yearLevel: string;
};

export type CandidateRow = {
  id: string;
  position: string;
  name: string;
  party: string;
  yearLevel: string;
};
