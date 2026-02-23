"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit2, Trash2 } from "lucide-react";
import { fetchElection, fetchPositions, createCandidates, updateElection } from "@/lib/ecasvoteApi";
import type { Position } from "@/lib/ecasvoteApi";
import { AdminSidebar } from "@/components/Sidebar";
import AdminHeader from "../components/header";
import PrintableBallot from "./ballot";

const ELECTION_ID = 'election-2025';

export default function ElectionManagementPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [adminInfo, setAdminInfo] = useState<any>(null);

  const handleLogout = () => {
    router.push("/login");
  };

  useEffect(() => {
    // Load admin info from localStorage
    if (typeof window !== "undefined") {
      const storedAdmin = localStorage.getItem("admin");
      if (storedAdmin) {
        try {
          setAdminInfo(JSON.parse(storedAdmin));
        } catch (e) {
          console.error("Failed to parse admin info:", e);
        }
      } else {
        setAdminInfo({ fullName: "SEB Admin" });
      }
    }

    // Load current election and positions
    async function loadData() {
      try {
        const [electionData, positionsData] = await Promise.all([
          fetchElection(ELECTION_ID).catch(() => null),
          fetchPositions(ELECTION_ID).catch(() => []),
        ]);
        
        if (electionData) {
          setElections([{
            id: ELECTION_ID,
            title: electionData.name || 'CAS Student Council Elections 2025',
            academicYear: '2025-2026',
            semester: 'First Semester',
            status: electionData.status || 'DRAFT',
            startEnd: `${electionData.startTime ? new Date(electionData.startTime).toLocaleString('en-US', { timeZone: 'Asia/Manila' }) : 'N/A'} - ${electionData.endTime ? new Date(electionData.endTime).toLocaleString('en-US', { timeZone: 'Asia/Manila' }) : 'N/A'}`,
          }]);
        }

        if (positionsData && positionsData.length > 0) {
          setPositions(positionsData);
          setBallotPositions(positionsData.map((p: Position) => p.name));
          
          // Load candidates from positions
          const allCandidates: any[] = [];
          positionsData.forEach((position: Position) => {
            if (position.candidates && position.candidates.length > 0) {
              position.candidates.forEach((candidate) => {
                allCandidates.push({
                  id: candidate.id,
                  position: position.name,
                  name: candidate.name,
                  party: candidate.party || 'Independent',
                  yearLevel: candidate.yearLevel || '',
                });
              });
            }
          });
          setCandidates(allCandidates);
        }
      } catch (err) {
        console.error('Failed to load election data:', err);
      }
    }
    loadData();
  }, []);

  const [elections, setElections] = useState<any[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingElection, setEditingElection] = useState<any>(null);
  const [ballotPositions, setBallotPositions] = useState<string[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newAcademicYear, setNewAcademicYear] = useState("2025-2026");
  const [newSemester, setNewSemester] = useState("First Semester");
  const [newStartDate, setNewStartDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  const [newStatus, setNewStatus] = useState("Draft");

  // Add Candidates modal state & draft rows
  const [showAddCandidatesModal, setShowAddCandidatesModal] = useState(false);
  const [candidateDrafts, setCandidateDrafts] = useState<Array<{ position: string; name: string; party: string; program: string; yearLevel: string }>>([
    { position: "", name: "", party: "", program: "", yearLevel: "" },
  ]);

  // Handlers for candidate drafts in modal
  const addCandidateDraftRow = () => {
    setCandidateDrafts((prev) => [...prev, { position: "", name: "", party: "", program: "", yearLevel: "" }]);
  };

  const removeCandidateDraftRow = (index: number) => {
    setCandidateDrafts((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [{ position: "", name: "", party: "", program: "", yearLevel: "" }];
    });
  };

  const updateCandidateDraft = (index: number, field: string, value: string) => {
    setCandidateDrafts((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  const saveCandidateDrafts = async () => {
    const toAdd = candidateDrafts.filter((c) => c.name.trim() !== "" && c.position.trim() !== "");

      if (toAdd.length === 0) {
        setShowAddCandidatesModal(false);
        setCandidateDrafts([{ position: "", name: "", party: "", program: "", yearLevel: "" }]);
        return;
      }

    try {
      // Save to database
      const candidatesToSave = toAdd.map((c) => ({
        positionName: c.position,
        name: c.name,
        party: c.party || undefined,
        program: c.program || undefined,
        yearLevel: c.yearLevel || undefined,
      }));

      const response = await createCandidates(ELECTION_ID, candidatesToSave);
      
      // Reload positions to get updated data
      const positionsData = await fetchPositions(ELECTION_ID);
      if (positionsData && positionsData.length > 0) {
        setPositions(positionsData);
        const allCandidates: any[] = [];
        positionsData.forEach((position: Position) => {
          if (position.candidates && position.candidates.length > 0) {
            position.candidates.forEach((candidate) => {
              allCandidates.push({
                id: candidate.id,
                position: position.name,
                name: candidate.name,
                party: candidate.party || 'Independent',
                yearLevel: candidate.yearLevel || '',
              });
            });
          }
        });
        setCandidates(allCandidates);
      }

      setShowAddCandidatesModal(false);
      setCandidateDrafts([{ position: "", name: "", party: "", program: "", yearLevel: "" }]);
      
      // Check election status to provide appropriate message
      try {
        const electionData = await fetchElection(ELECTION_ID);
        if (electionData?.status === 'OPEN' || electionData?.status === 'CLOSED') {
          alert(`Successfully added ${response.count} candidate(s) to database!\n\nNote: Candidates were saved to the database but not registered on blockchain because the election is ${electionData.status}. To register on blockchain, the election must be in DRAFT status.`);
        } else {
          alert(`Successfully added ${response.count} candidate(s) to database and blockchain!`);
        }
      } catch (e) {
        alert(`Successfully added ${response.count} candidate(s) to database!`);
      }
    } catch (err: any) {
      console.error('Failed to save candidates:', err);
      alert(`Failed to save candidates: ${err.message || 'Unknown error'}`);
    }
  };

  const handleUpdateElection = async () => {
    if (!editingElection) return;

    if (!newTitle || !newStartDate || !newEndDate) {
      alert('Please fill in all required fields (Title, Start Date & Time, End Date & Time)');
      return;
    }

    try {
      // Format datetime for API (ISO string)
      // datetime-local input returns format: "YYYY-MM-DDTHH:mm"
      const startTime = new Date(newStartDate).toISOString();
      const endTime = new Date(newEndDate).toISOString();

      // Update on blockchain and database
      await updateElection(editingElection.id, {
        name: newTitle,
        description: `${newAcademicYear} - ${newSemester}`,
        startTime,
        endTime,
      });

      // Reload election data from blockchain
      const electionData = await fetchElection(editingElection.id);
      if (electionData) {
        setElections([{
          id: editingElection.id,
          title: electionData.name || newTitle,
          academicYear: newAcademicYear,
          semester: newSemester,
          status: electionData.status || editingElection.status,
          startEnd: `${new Date(electionData.startTime).toLocaleString('en-US', { timeZone: 'Asia/Manila' })} - ${new Date(electionData.endTime).toLocaleString('en-US', { timeZone: 'Asia/Manila' })}`,
        }]);
      }

      setShowEditModal(false);
      setEditingElection(null);
      setNewTitle("");
      setNewStartDate("");
      setNewEndDate("");
      alert('Election updated successfully on blockchain and database!');
    } catch (err: any) {
      console.error('Failed to update election:', err);
      alert(`Failed to update election: ${err.message || 'Unknown error'}`);
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'OPEN':
        return 'bg-green-100 text-green-800';
      case 'CLOSED':
        return 'bg-red-100 text-red-800';
      case 'DRAFT':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <style jsx global>{`
        button { cursor: pointer; }
        aside nav a { pointer-events: auto !important; cursor: pointer !important; }
      `}</style>
      <AdminSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        active="election"
        userName="John"
        onLogout={handleLogout}
        fixed
        pathname={pathname}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <AdminHeader 
          title="Election Management" 
          subtitle="Configure elections, positions, and candidates"
          sidebarOpen={sidebarOpen}
        />
        {/* Main Content Area */}
        <main className={`flex-1 p-6 overflow-y-auto transition-all duration-300 ${
          sidebarOpen ? "ml-64" : "ml-20"
        }`}>
          <div className="w-full max-w-6xl mx-auto space-y-6">
            {/* Election List Section */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-2xl">Election List</CardTitle>
                  <Button
                    className="text-white"
                    style={{ backgroundColor: "#7A0019" }}
                    onClick={() => setShowCreateModal(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create New Election
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">
                          Election Title
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">
                          Academic Year
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">
                          Semester
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">
                          Status
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">
                          Start-End
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">
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
                            <td className="py-4 px-4 text-gray-900 font-medium">
                              {election.title}
                            </td>
                            <td className="py-4 px-4 text-gray-700">
                              {election.academicYear}
                            </td>
                            <td className="py-4 px-4 text-gray-700">
                              {election.semester}
                            </td>
                            <td className="py-4 px-4">
                              <Badge className={getStatusBadgeColor(election.status)}>
                                {election.status}
                              </Badge>
                            </td>
                            <td className="py-4 px-4 text-gray-700">
                              {election.startEnd}
                            </td>
                            <td className="py-4 px-4">
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-[#7A0019]"
                                onClick={async () => {
                                  setEditingElection(election);
                                  // Parse dates from startEnd string if available
                                  const dateRange = election.startEnd?.split(' - ') || [];
                                  setNewTitle(election.title || '');
                                  setNewAcademicYear(election.academicYear || '2025-2026');
                                  setNewSemester(election.semester || 'First Semester');
                                  // Try to parse dates/times - fetch from blockchain if available
                                  let startDate = '';
                                  let endDate = '';
                                  
                                  // Try to fetch actual election data from blockchain for accurate datetime
                                  try {
                                    const electionData = await fetchElection(election.id);
                                    if (electionData?.startTime && electionData?.endTime) {
                                      // Convert ISO string to datetime-local format (YYYY-MM-DDTHH:mm)
                                      const start = new Date(electionData.startTime);
                                      const end = new Date(electionData.endTime);
                                      // Format: YYYY-MM-DDTHH:mm (datetime-local format)
                                      startDate = start.toISOString().slice(0, 16);
                                      endDate = end.toISOString().slice(0, 16);
                                    } else {
                                      // Fallback to parsing from startEnd string
                                      if (dateRange.length === 2) {
                                        const start = dateRange[0].trim();
                                        const end = dateRange[1].trim();
                                        if (start && start !== 'YYYY-MM-DD' && start !== 'N/A') {
                                          try {
                                            const parsedStart = new Date(start);
                                            if (!isNaN(parsedStart.getTime())) {
                                              startDate = parsedStart.toISOString().slice(0, 16);
                                            }
                                          } catch (e) {
                                            startDate = start;
                                          }
                                        }
                                        if (end && end !== 'YYYY-MM-DD' && end !== 'N/A') {
                                          try {
                                            const parsedEnd = new Date(end);
                                            if (!isNaN(parsedEnd.getTime())) {
                                              endDate = parsedEnd.toISOString().slice(0, 16);
                                            }
                                          } catch (e) {
                                            endDate = end;
                                          }
                                        }
                                      }
                                    }
                                  } catch (fetchErr) {
                                    console.warn('Could not fetch election data, using parsed dates:', fetchErr);
                                    // Fallback to parsing from startEnd string
                                    if (dateRange.length === 2) {
                                      const start = dateRange[0].trim();
                                      const end = dateRange[1].trim();
                                      if (start && start !== 'YYYY-MM-DD' && start !== 'N/A') {
                                        try {
                                          const parsedStart = new Date(start);
                                          if (!isNaN(parsedStart.getTime())) {
                                            startDate = parsedStart.toISOString().slice(0, 16);
                                          }
                                        } catch (e) {
                                          startDate = start;
                                        }
                                      }
                                      if (end && end !== 'YYYY-MM-DD' && end !== 'N/A') {
                                        try {
                                          const parsedEnd = new Date(end);
                                          if (!isNaN(parsedEnd.getTime())) {
                                            endDate = parsedEnd.toISOString().slice(0, 16);
                                          }
                                        } catch (e) {
                                          endDate = end;
                                        }
                                      }
                                    }
                                  }
                                  setNewStartDate(startDate);
                                  setNewEndDate(endDate);
                                  setNewStatus(election.status || 'Draft');
                                  setShowEditModal(true);
                                }}
                              >
                                Edit
                              </Button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={6}
                            className="py-8 px-4 text-center text-gray-500"
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

            {/* Candidate Management Section */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between mb-4">
                  <CardTitle className="text-2xl">Candidate Management</CardTitle>
                </div>
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-medium">Select Election:</label>
                    <select className="border border-gray-300 rounded-md px-3 py-2 text-sm cursor-pointer">
                      <option>Select Election</option>
                      {elections.map((election) => (
                        <option key={election.id} value={election.id}>
                          {election.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="text-white"
                      style={{ backgroundColor: "#7A0019" }}
                      onClick={() => setShowAddCandidatesModal(true)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add New Candidate
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => {
                        alert('Draft saved locally. Click "Add Candidates" to save to database.');
                      }}
                    >
                      Save Draft
                    </Button>
                    <PrintableBallot 
                      candidates={candidates} 
                      election={elections[0] || { title: "UPV CAS SC Elections", academicYear: "2025-2026", semester: "First Semester" }} 
                    />
                    <Button
                      className="text-white"
                      style={{ backgroundColor: "#0C8C3F" }}
                      onClick={async () => {
                        // Reload candidates from database
                        try {
                          const positionsData = await fetchPositions(ELECTION_ID);
                          if (positionsData && positionsData.length > 0) {
                            setPositions(positionsData);
                            const allCandidates: any[] = [];
                            positionsData.forEach((position: Position) => {
                              if (position.candidates && position.candidates.length > 0) {
                                position.candidates.forEach((candidate) => {
                                  allCandidates.push({
                                    id: candidate.id,
                                    position: position.name,
                                    name: candidate.name,
                                    party: candidate.party || 'Independent',
                                    yearLevel: candidate.yearLevel || '',
                                  });
                                });
                              }
                            });
                            setCandidates(allCandidates);
                            alert('Candidates refreshed from database!');
                          }
                        } catch (err: any) {
                          console.error('Failed to refresh candidates:', err);
                          alert(`Failed to refresh: ${err.message || 'Unknown error'}`);
                        }
                      }}
                    >
                      Refresh
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">
                          Position
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">
                          Candidate Name
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">
                          Party
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.length > 0 ? (
                        candidates.map((candidate, index) => (
                          <tr
                            key={candidate.id || index}
                            className="border-b border-gray-100 hover:bg-gray-50"
                          >
                            <td className="py-4 px-4 text-gray-900 font-medium">
                              {candidate.position}
                            </td>
                            <td className="py-4 px-4 text-gray-700">
                              {candidate.name}
                            </td>
                            <td className="py-4 px-4 text-gray-700">
                              {candidate.party}
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-gray-600"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600"
                                  onClick={() => {
                                    setCandidates((prev) => prev.filter((_, i) => i !== index));
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={4}
                            className="py-8 px-4 text-center text-gray-500"
                          >
                            No candidates added yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Create Election Modal */}
          {showCreateModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/50" onClick={() => setShowCreateModal(false)} />
              <div className="relative bg-white rounded-lg w-full max-w-2xl p-6 mx-4">
                <div className="flex items-start justify-between">
                  <h3 className="text-2xl font-semibold text-[#7A0019]">Create New Election</h3>
                  <Button variant="ghost" size="icon" onClick={() => setShowCreateModal(false)}>
                    ✕
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Election Title</label>
                    <Input
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Election Title"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
                    <select
                      className="w-full border rounded px-3 py-2"
                      value={newAcademicYear}
                      onChange={(e) => setNewAcademicYear(e.target.value)}
                    >
                      <option>2025-2026</option>
                      <option>2026-2027</option>
                      <option>2027-2028</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Semester</label>
                    <select
                      className="w-full border rounded px-3 py-2"
                      value={newSemester}
                      onChange={(e) => setNewSemester(e.target.value)}
                    >
                      <option>First Semester</option>
                      <option>Second Semester</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date & Time</label>
                    <input
                      type="datetime-local"
                      className="w-full border rounded px-3 py-2"
                      value={newStartDate}
                      onChange={(e) => setNewStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End Date & Time</label>
                    <input
                      type="datetime-local"
                      className="w-full border rounded px-3 py-2"
                      value={newEndDate}
                      onChange={(e) => setNewEndDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      className="w-full border rounded px-3 py-2"
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                    >
                      <option>Draft</option>
                      <option>Ongoing</option>
                      <option>Closed</option>
                    </select>
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </Button>
                  <Button
                    className="text-white"
                    style={{ backgroundColor: "#7A0019" }}
                    onClick={() => {
                      const newElection = {
                        id: Date.now().toString(),
                        title: newTitle || "Untitled Election",
                        academicYear: newAcademicYear,
                        semester: newSemester,
                        status: newStatus,
                        startEnd: `${newStartDate || 'YYYY-MM-DDTHH:mm'} - ${newEndDate || 'YYYY-MM-DDTHH:mm'}`,
                      };
                      setElections((prev) => [newElection, ...prev]);
                      setShowCreateModal(false);
                      setNewTitle("");
                      setNewStartDate("");
                      setNewEndDate("");
                    }}
                  >
                    Create Election
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Edit Election Modal */}
          {showEditModal && editingElection && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/50" onClick={() => {
                setShowEditModal(false);
                setEditingElection(null);
              }} />
              <div className="relative bg-white rounded-lg w-full max-w-2xl p-6 mx-4">
                <div className="flex items-start justify-between">
                  <h3 className="text-2xl font-semibold text-[#7A0019]">Edit Election</h3>
                  <Button variant="ghost" size="icon" onClick={() => {
                    setShowEditModal(false);
                    setEditingElection(null);
                  }}>
                    ✕
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Election Title</label>
                    <Input
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Election Title"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
                    <select
                      className="w-full border rounded px-3 py-2"
                      value={newAcademicYear}
                      onChange={(e) => setNewAcademicYear(e.target.value)}
                    >
                      <option>2025-2026</option>
                      <option>2026-2027</option>
                      <option>2027-2028</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Semester</label>
                    <select
                      className="w-full border rounded px-3 py-2"
                      value={newSemester}
                      onChange={(e) => setNewSemester(e.target.value)}
                    >
                      <option>First Semester</option>
                      <option>Second Semester</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date & Time</label>
                    <input
                      type="datetime-local"
                      className="w-full border rounded px-3 py-2"
                      value={newStartDate}
                      onChange={(e) => setNewStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End Date & Time</label>
                    <input
                      type="datetime-local"
                      className="w-full border rounded px-3 py-2"
                      value={newEndDate}
                      onChange={(e) => setNewEndDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      className="w-full border rounded px-3 py-2"
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                    >
                      <option>Draft</option>
                      <option>Ongoing</option>
                      <option>Closed</option>
                    </select>
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <Button variant="outline" onClick={() => {
                    setShowEditModal(false);
                    setEditingElection(null);
                  }}>
                    Cancel
                  </Button>
                  <Button
                    className="text-white"
                    style={{ backgroundColor: "#7A0019" }}
                    onClick={handleUpdateElection}
                  >
                    Update Election
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Add Candidates Modal */}
          {showAddCandidatesModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/50" onClick={() => setShowAddCandidatesModal(false)} />
              <div className="relative bg-white rounded-lg w-full max-w-3xl p-6 mx-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-start justify-between">
                  <h3 className="text-2xl font-semibold text-[#7A0019]">Add Candidates</h3>
                  <Button variant="ghost" size="icon" onClick={() => setShowAddCandidatesModal(false)}>
                    ✕
                  </Button>
                </div>
                <div className="mt-4 space-y-4">
                  {candidateDrafts.map((d, idx) => (
                    <div key={idx} className="grid grid-cols-1 md:grid-cols-7 gap-3 items-end border-b pb-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Position</label>
                        <select
                          className="w-full border rounded px-2 py-2 text-sm"
                          value={d.position}
                          onChange={(e) => updateCandidateDraft(idx, "position", e.target.value)}
                        >
                          <option value="">Select Position</option>
                          {ballotPositions.length > 0 ? (
                            ballotPositions.map((p: string, i: number) => (
                              <option key={i} value={p}>
                                {p}
                              </option>
                            ))
                          ) : (
                            <>
                              <option>USC Councilor</option>
                              <option>CAS Representative to the USC</option>
                              <option>CAS Chairperson</option>
                              <option>CAS Vice Chairperson</option>
                              <option>CAS Councilor</option>
                              <option>Clovers Governor</option>
                              <option>Elektrons Governor</option>
                              <option>Redbolts Governor</option>
                              <option>Skimmers Governor</option>
                            </>
                          )}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Candidate Name</label>
                        <Input
                          value={d.name}
                          onChange={(e) => updateCandidateDraft(idx, "name", e.target.value)}
                          placeholder="Candidate Full Name"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Party</label>
                        <select
                          className="w-full border rounded px-2 py-2 text-sm"
                          value={d.party}
                          onChange={(e) => updateCandidateDraft(idx, "party", e.target.value)}
                        >
                          <option value="">Select Political Party</option>
                          <option>PMB</option>
                          <option>SAMASA</option>
                          <option>Independent</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Program</label>
                        <Input
                          value={d.program}
                          onChange={(e) => updateCandidateDraft(idx, "program", e.target.value)}
                          placeholder="e.g., BS Computer Science"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Year Level</label>
                        <select
                          className="w-full border rounded px-2 py-2 text-sm"
                          value={d.yearLevel}
                          onChange={(e) => updateCandidateDraft(idx, "yearLevel", e.target.value)}
                        >
                          <option value="">Select Year</option>
                          <option>1</option>
                          <option>2</option>
                          <option>3</option>
                          <option>4</option>
                          <option>5</option>
                        </select>
                      </div>
                      <div className="flex items-center px-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600"
                          onClick={() => removeCandidateDraftRow(idx)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <Button variant="ghost" onClick={addCandidateDraftRow}>
                    + Add additional candidate
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowAddCandidatesModal(false);
                        setCandidateDrafts([{ position: "", name: "", party: "", program: "", yearLevel: "" }]);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="text-white"
                      style={{ backgroundColor: "#7A0019" }}
                      onClick={saveCandidateDrafts}
                    >
                      Add Candidates
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}