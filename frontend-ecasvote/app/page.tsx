"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, BarChart3, Settings } from "lucide-react";
import { fetchElections } from "@/lib/ecasvoteApi";
import type { Election } from "@/lib/ecasvoteApi";

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LandingPage() {
  const [election, setElection] = useState<Election | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchElections()
      .then((list) => {
        // Prefer OPEN election, then most recent CLOSED, then first
        const open = list.find((e) => e.status === "OPEN");
        const closed = list.find((e) => e.status === "CLOSED");
        setElection(open ?? closed ?? list[0] ?? null);
      })
      .catch(() => setElection(null))
      .finally(() => setLoading(false));
  }, []);

  const status = election?.status?.toUpperCase() ?? "";
  const statusColor =
    status === "OPEN"
      ? "bg-green-600"
      : status === "CLOSED"
      ? "bg-gray-600"
      : "bg-amber-600";

  return (
    <main className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Image
              src="/ecasvotelogo.jpeg"
              alt="eCASVote"
              width={160}
              height={40}
              className="h-10 w-auto"
              priority
            />
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="outline" size="sm">
                <Settings className="mr-2 h-4 w-4" />
                Admin / Validator Login
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Hero */}
      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">
            CAS Student Council Elections
          </h1>
          <p className="text-lg text-gray-500">
            Where your vote truly matters.
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">
            Loading election info...
          </div>
        ) : !election ? (
          <Card>
            <CardContent className="py-12 text-center text-gray-500">
              No elections have been created yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {/* Election info card */}
            <Card className="border-gray-200 shadow-sm">
              <CardContent className="py-8">
                <div className="flex flex-col items-center text-center gap-4">
                  <Badge className={`${statusColor} text-white text-sm px-3 py-1`}>
                    {status}
                  </Badge>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {election.name}
                  </h2>
                  {election.description && (
                    <p className="text-gray-500">{election.description}</p>
                  )}
                  <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-500 mt-2">
                    <div>
                      <span className="font-medium text-gray-700">Start: </span>
                      {formatDate(election.startTime)}
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">End: </span>
                      {formatDate(election.endTime)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Action buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
              {election.candidatesPublished ? (
                <Link href="/studentvoter/candidates" className="block">
                  <Card className="h-full border-gray-200 hover:border-[#7A0019]/40 hover:shadow-md transition-all cursor-pointer">
                    <CardContent className="py-8 text-center">
                      <Users className="mx-auto h-10 w-10 text-[#7A0019] mb-3" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">
                        View Candidates
                      </h3>
                      <p className="text-sm text-gray-500">
                        See the official candidate list by position
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ) : (
                <Card className="h-full border-gray-200 opacity-60">
                  <CardContent className="py-8 text-center">
                    <Users className="mx-auto h-10 w-10 text-gray-400 mb-3" />
                    <h3 className="text-lg font-semibold text-gray-500 mb-1">
                      Candidates
                    </h3>
                    <p className="text-sm text-gray-400">
                      Not yet published
                    </p>
                  </CardContent>
                </Card>
              )}

              {election.resultsPublished ? (
                <Link href="/studentvoter/results" className="block">
                  <Card className="h-full border-gray-200 hover:border-[#0C8C3F]/40 hover:shadow-md transition-all cursor-pointer">
                    <CardContent className="py-8 text-center">
                      <BarChart3 className="mx-auto h-10 w-10 text-[#0C8C3F] mb-3" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">
                        View Results
                      </h3>
                      <p className="text-sm text-gray-500">
                        See the election results and winners
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ) : (
                <Card className="h-full border-gray-200 opacity-60">
                  <CardContent className="py-8 text-center">
                    <BarChart3 className="mx-auto h-10 w-10 text-gray-400 mb-3" />
                    <h3 className="text-lg font-semibold text-gray-500 mb-1">
                      Results
                    </h3>
                    <p className="text-sm text-gray-400">
                      {status === "CLOSED" ? "Not yet published" : "Available after election closes"}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t mt-16">
        <div className="mx-auto max-w-5xl px-6 py-6 text-center text-sm text-gray-400">
          eCASVote - Secured by Hyperledger Fabric Blockchain
        </div>
      </div>
    </main>
  );
}
