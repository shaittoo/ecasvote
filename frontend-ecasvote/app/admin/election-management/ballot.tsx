"use client";

import React from "react";
import { notify } from "@/lib/notify";
import { Download } from "lucide-react";
import QRCode from "qrcode";

type Candidate = {
  id: string;
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
  const printBallot = async () => {
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

    const ballotId = `BALLOT-${Date.now()}`;
    const qrImage = await QRCode.toDataURL(ballotId);

    const ballotHTML = `
      <html>
      <head>
        <title>Election Ballot</title>
        <style>
          @page { size: A4; margin: 10mm; }
          body { font-family: Arial, sans-serif; padding: 10px; margin:0; position: relative; }
          h2 { text-align:center; margin-top:0; }
          .header-info { text-align:center; font-size:12px; margin-bottom:10px; }
          .qr { position:absolute; top:10px; right:10px; }
          .positions { display:flex; flex-wrap:wrap; justify-content:space-between; margin-top:50px; }
          .position { width:48%; margin-bottom:15px; }
          .position h3 { margin:5px 0; font-size:14px; }
          .candidate { display:flex; align-items:center; font-size:12px; margin-bottom:3px; }
          .circle { width:18px; height:18px; border:1px solid #000; border-radius:50%; margin-right:5px; }
          hr { margin:10px 0; border:0; border-top:1px solid #000; }
        </style>
      </head>
      <body>
        <div class="qr"><img src="${qrImage}" width="50" height="50" /></div>
        <h2>Election Ballot - ${election.title}</h2>
        <div class="header-info">Academic Year: ${election.academicYear} | Semester: ${election.semester}</div>
        <hr />
        <div class="positions">
          ${Object.keys(groupedByPosition)
            .map(
              (position) => `
              <div class="position">
                <h3>${position}</h3>
                ${groupedByPosition[position]
                  .map(
                    (c) => `
                  <div class="candidate">
                    <div class="circle"></div>
                    ${c.name} (${c.party})
                  </div>
                `
                  )
                  .join("")}
              </div>
            `
            )
            .join("")}
        </div>
        <hr />
      </body>
      </html>
    `;

    const iframe = document.createElement("iframe");
    iframe.style.position = "absolute";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(ballotHTML);
    doc.close();

    const img = iframe.contentDocument?.querySelector("img");
    if (img) {
      img.addEventListener("load", () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();

        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      });
    } else {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }
  };

  return (
    <button
      className="flex items-center text-white px-3 py-2 rounded"
      style={{ backgroundColor: "#0C5DA5" }}
      onClick={printBallot}
    >
      <Download className="h-4 w-4 mr-2" />
      Export Ballot
    </button>
  );
};

export default PrintableBallot;