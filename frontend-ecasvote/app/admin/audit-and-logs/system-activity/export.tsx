"use client";

import type { SystemActivity } from "@/lib/ecasvoteApi";
import { notify } from "@/lib/notify";

export function exportSystemActCSV(
  logs: SystemActivity[],
  filename = "system-activity.csv"
) {
  if (logs.length === 0) {
    notify.error({
      title: "No data",
      description: "No system activity to export.",
    });
    return;
  }

  const headers = [
    "ID",
    "Timestamp",
    "User",
    "Role",
    "Action",
    "Description",
    "IP Address",
    "Status",
  ];

  const rows = logs.map((log) => [
    log.id ?? "",
    new Date(log.timestamp).toLocaleString(),
    log.user ?? "",
    log.role ?? "",
    log.action ?? "",
    log.description ?? "",
    log.ipAddress ?? "",
    log.status ?? "",
  ]);

  const csvContent = [headers, ...rows]
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

  notify.success({
    title: "CSV exported",
    description: "System activity CSV downloaded.",
  });
}
export function printSysActTable(tableId: string, title: string) {
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

  notify.success({
    title: "Print triggered",
    description: "System activity table sent to printer.",
  });
}