"use client";

import { useEffect, useState } from "react";
import Sidebar from "../../components/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Upload } from "lucide-react";

interface Voter {
  studentNumber: string;
  name: string;
  department: string;
  program: string;
  yearLevel: string;
  status: "Voted" | "Not Voted";
}

export default function VoterRosterPage() {
  const [loading, setLoading] = useState(true);
  const [voters, setVoters] = useState<Voter[]>([]);
  const [search, setSearch] = useState("");
  const [selectedElection, setSelectedElection] = useState("CAS SC Elections 2026");

  useEffect(() => {
    // Replace with API call later
    setTimeout(() => {
      setVoters([]);
      setLoading(false);
    }, 800);
  }, []);

  const filteredVoters = voters.filter(v =>
    `${v.studentNumber} ${v.name}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />

      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">Voter Roster</h1>
          <select
            className="border rounded px-3 py-2"
            value={selectedElection}
            onChange={(e) => setSelectedElection(e.target.value)}
          >
            <option>{selectedElection}</option>
          </select>
        </header>

        {/* Main */}
        <main className="flex-1 p-6 overflow-y-auto">
          {loading ? (
            <div className="text-center py-12 text-gray-500">
              Loading voter roster...
            </div>
          ) : (
            <div className="max-w-7xl mx-auto space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg">Registered Voters</CardTitle>
                  <div className="flex items-center justify-between gap-4">
                    {/* Search */}
                    <div className="flex-1 max-w-2xl">
                        <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <Input
                            type="text"
                            placeholder="Search keyword or actions..."
                            className="w-full pl-10 pr-20"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                            {filteredVoters.length} results
                        </span>
                        </div>
                    </div>

                    {/* Import Button */}
                    <Button className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2">
                        <Upload className="w-4 h-4" />
                        Import Voter Roster
                    </Button>
                    </div>
                </CardHeader>

                <CardContent>
                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b text-sm text-gray-600">
                          <th className="text-left py-2">Student Number</th>
                          <th className="text-left py-2">Student Name</th>
                          <th className="text-left py-2">Department</th>
                          <th className="text-left py-2">Degree Program</th>
                          <th className="text-left py-2">Year Level</th>
                          <th className="text-left py-2">Status</th>
                          <th className="text-left py-2">Action</th>
                        </tr>
                      </thead>

                      <tbody>
                        {filteredVoters.length === 0 ? (
                          <tr>
                            <td
                              colSpan={7}
                              className="text-center py-10 text-gray-500"
                            >
                              No voter roster available.
                            </td>
                          </tr>
                        ) : (
                          filteredVoters.map((voter, index) => (
                            <tr
                              key={index}
                              className="border-b text-sm hover:bg-gray-50"
                            >
                              <td className="py-2">{voter.studentNumber}</td>
                              <td className="py-2">{voter.name}</td>
                              <td className="py-2">{voter.department}</td>
                              <td className="py-2">{voter.program}</td>
                              <td className="py-2">{voter.yearLevel}</td>
                              <td className="py-2">
                                <span
                                  className={`px-2 py-1 rounded text-xs font-medium ${
                                    voter.status === "Voted"
                                      ? "bg-green-100 text-green-700"
                                      : "bg-gray-100 text-gray-600"
                                  }`}
                                >
                                  {voter.status}
                                </span>
                              </td>
                              <td className="py-2">
                                <Button size="sm" variant="outline">
                                  View
                                </Button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                    {filteredVoters.length > 0 && (
                    <div className="flex justify-center mt-4 text-sm text-gray-600">
                        Prev 10 · 1 · 2 · 3 · Next 10 →
                    </div>
                    )}
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}