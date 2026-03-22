"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Plus, Edit2, Trash2, Printer } from "lucide-react";
import type { ElectionRow } from "./types";
import { getStatusBadgeColor } from "./utils";

type Props = {
  elections: ElectionRow[];
  onCreateClick: () => void;
  onDeleteClick: (election: ElectionRow) => void;
  editHref: (electionId: string) => string;
};

export function ElectionListCard({
  elections,
  onCreateClick,
  onDeleteClick,
  editHref,
}: Props) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-2xl">Election List</CardTitle>
          <Button
            className="text-white"
            style={{ backgroundColor: "#7A0019" }}
            onClick={onCreateClick}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create New Election
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-4 py-3 text-left font-semibold text-gray-900">
                  Election Title
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">
                  Academic Year
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">
                  Semester
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">
                  Start-End
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {elections.length > 0 ? (
                elections.map((election) => (
                  <tr
                    key={election.id}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-4 py-4 font-medium text-gray-900">
                      {election.title}
                    </td>
                    <td className="px-4 py-4 text-gray-700">
                      {election.academicYear}
                    </td>
                    <td className="px-4 py-4 text-gray-700">
                      {election.semester}
                    </td>
                    <td className="px-4 py-4">
                      <Badge className={getStatusBadgeColor(election.status)}>
                        {election.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-gray-700">{election.startEnd}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/admin/ballot-print?electionId=${encodeURIComponent(election.id)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "inline-flex items-center text-[#7A0019]"
                          )}
                        >
                          <Printer className="mr-1.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                          Preview Ballot
                        </Link>
                        <Link
                          href={editHref(election.id)}
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "inline-flex items-center gap-1.5 text-[#7A0019]"
                          )}
                        >
                          <Edit2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          Edit
                        </Link>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-destructive/40 text-destructive hover:bg-destructive/10"
                          onClick={() =>
                            onDeleteClick({
                              ...election,
                              title: election.title || election.id,
                            })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    No election available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
