"use client";

import type { AuditLog } from "@/lib/ecasvoteApi";
import { notify } from "@/lib/notify";

export function exportAuditLogsCSV(logs: AuditLog[], filename = "audit-logs.csv") {
  if (logs.length === 0) {
    notify.error({ title: "No data", description: "No audit logs to export." });
    return;
  }

  const headers = [
    "Transaction ID",
    "Block #",
    "Function",
    "Endorsements",
    "Validation",
    "Time Stamp",
    "Positions",
  ];

  const rows = logs.map((log) => {
    const positions = log.details?.selections
      ?.map((s: any) => `${s.positionId} → ${s.candidateId}`)
      .join("; ") ?? "";

    return [
      log.txId ?? "",
      log.details?.blockNumber ?? "",
      log.details?.function ?? log.action,
      log.details?.endorsers ?? "",
      log.details?.validation ?? "",
      new Date(log.createdAt).toLocaleString(),
      positions,
    ];
  });

  const csvContent =
    [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  notify.success({ title: "CSV exported", description: "Audit logs CSV downloaded." });
}

export function printAuditTable(tableId: string, title: string) {
  const tableElement = document.getElementById(tableId);
  if (!tableElement) {
    notify.error({ title: "Table not found" });
    return;
  }

  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) return;

  printWindow.document.write(`
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: sans-serif; padding: 20px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
          th { background-color: #f3f3f3; }
          ul { padding-left: 1rem; margin: 0; }
        </style>
      </head>
      <body>
        <h2>${title}</h2>
        ${tableElement.outerHTML}
      </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  printWindow.close();

  notify.success({ title: "Print triggered", description: "Audit table sent to printer." });
}