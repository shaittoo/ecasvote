"use client";

import React from "react";
import { notify } from "@/lib/notify";
import { Download } from "lucide-react";

type Candidate = {
  position: string;
  name: string;
  party: string;
};

type Election = {
  title: string;
  academicYear: string;
  semester: string;
};

type PrintableBallotProps = {
  candidates: Candidate[];
  election: Election;
};

const PrintableBallot: React.FC<PrintableBallotProps> = ({ candidates, election }) => {
  const print = () => {
    if (!candidates || candidates.length === 0) {
      notify.error({
        title: "Failed to print ballot",
        description: "No candidates available to print.",
      });
      return;
    }

    const groupedByPosition: Record<string, Candidate[]> = {};
    candidates.forEach((c) => {
      if (!groupedByPosition[c.position]) groupedByPosition[c.position] = [];
      groupedByPosition[c.position].push(c);
    });

    // exportable ballot for now
    let ballotHTML = `
      <html>
      <head>
        <title>Election Ballot</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h2 { margin-bottom: 0.25em; }
          h3 { margin-top: 1em; margin-bottom: 0.5em; }
          .position { margin-bottom: 1.5em; }
          .candidate { margin-left: 20px; margin-bottom: 0.25em; }
          input[type="checkbox"] { margin-right: 10px; }
          hr { margin: 1em 0; }
        </style>
      </head>
      <body>
        <h2>Election Ballot - ${election.title}</h2>
        <p>Academic Year: ${election.academicYear} | Semester: ${election.semester}</p>
        <hr />
    `;

    Object.keys(groupedByPosition).forEach((position) => {
      ballotHTML += `<div class="position"><h3>${position}</h3>`;
      groupedByPosition[position].forEach((candidate) => {
        ballotHTML += `
          <div class="candidate">
            <input type="checkbox" /> ${candidate.name} (${candidate.party})
          </div>
        `;
      });
      ballotHTML += `</div>`;
    });

    ballotHTML += `
        <hr />
        <p style="margin-top:2em;">Please select one candidate per position.</p>
      </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(ballotHTML);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    }
  };

  return (
    <button
      className="flex items-center text-white px-3 py-2 rounded"
      style={{ backgroundColor: "#0C5DA5" }}
      onClick={print}
    >
      <Download className="h-4 w-4 mr-2" />
      Export Ballot
    </button>
  );
};

export default PrintableBallot;