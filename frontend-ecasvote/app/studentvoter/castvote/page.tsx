// frontend-ecasvote/app/vote/page.tsx
"use client";

import { FormEvent, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { castVote, registerVoter, fetchElection, openElection, fetchPositions, Position } from "@/lib/ecasvoteApi";
import { Button } from "@/components/ui/button";
import { StudentVoterSidebar } from "@/components/Sidebar";
import { User, XCircle } from "lucide-react";
import { VoteModals } from "./modal";
import { VoteInstructions } from "./instructions";
import StudentVoterHeader from "../components/header";

const ELECTION_ID = "election-2025";

export default function VotePage() {
  const router = useRouter();
  const [showInstructions, setShowInstructions] = useState(true);
  const [studentNumber, setStudentNumber] = useState<string | null>(null);
  const [voterInfo, setVoterInfo] = useState<any>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<Record<string, string[]>>({});
  const [abstainPositions, setAbstainPositions] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState<string>("");
  const [voterName, setVoterName] = useState("");
  const [authConfirmed, setAuthConfirmed] = useState(false);
  const [transactionTimestamp, setTransactionTimestamp] = useState<string | null>(null);

  useEffect(() => {
    // Load student number from localStorage (set during login)
    if (typeof window !== "undefined") {
      const storedStudentNumber = localStorage.getItem("studentNumber");
      const storedVoter = localStorage.getItem("voter");
      
      if (!storedStudentNumber) {
        // Redirect to login if not logged in
        router.push("/login");
        return;
      }
      
      setStudentNumber(storedStudentNumber);
      if (storedVoter) {
        try {
          setVoterInfo(JSON.parse(storedVoter));
        } catch (e) {
          console.error("Failed to parse voter info:", e);
        }
      }
    }
  }, [router]);

  useEffect(() => {
    async function loadPositions() {
      if (!studentNumber) return; // Wait for student number to be loaded
      
      try {
        const positionsData = await fetchPositions(ELECTION_ID);
        setPositions(positionsData);
        
        // Initialize selected candidates and abstain for each position
        const initialSelections: Record<string, string[]> = {};
        const initialAbstain: Record<string, boolean> = {};
        positionsData.forEach((pos) => {
          initialSelections[pos.id] = [];
          initialAbstain[pos.id] = false;
        });
        setSelectedCandidates(initialSelections);
        setAbstainPositions(initialAbstain);
      } catch (err: any) {
        console.error("Failed to load positions:", err);
        setErrorModalMessage("Failed to load ballot. Please refresh the page.");
        setShowErrorModal(true);
      } finally {
        setLoading(false);
      }
    }
    loadPositions();
  }, [studentNumber]);

  function handleCandidateToggle(positionId: string, candidateId: string, maxVotes: number) {
    // If selecting a candidate, clear abstain for this position
    setAbstainPositions((prev) => ({
      ...prev,
      [positionId]: false,
    }));

    setSelectedCandidates((prev) => {
      const current = prev[positionId] || [];
      const isSelected = current.includes(candidateId);

      if (isSelected) {
        // Deselect
        return {
          ...prev,
          [positionId]: current.filter((id) => id !== candidateId),
        };
      } else {
        // Select (but respect maxVotes)
        if (current.length >= maxVotes) {
          // If max votes reached, replace the first one
          return {
            ...prev,
            [positionId]: [candidateId, ...current.slice(1)],
          };
        } else {
          return {
            ...prev,
            [positionId]: [...current, candidateId],
          };
        }
      }
    });
  }

  function handleAbstainToggle(positionId: string) {
    const isAbstaining = abstainPositions[positionId] || false;
    
    if (isAbstaining) {
      // Deselect abstain
      setAbstainPositions((prev) => ({
        ...prev,
        [positionId]: false,
      }));
    } else {
      // Select abstain - clear all candidates for this position
      setAbstainPositions((prev) => ({
        ...prev,
        [positionId]: true,
      }));
      setSelectedCandidates((prev) => ({
        ...prev,
        [positionId]: [],
      }));
    }
  }

  function handleReviewClick(e: FormEvent) {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    if (!studentNumber) {
      setErrorMessage("Student number not found. Please log in again.");
      router.push("/login");
      return;
    }

    // Filter positions to only include those visible to the voter
    const visiblePositions = positions.filter((position) => {
      const isGovernorPosition = position.id.includes('-governor');
      if (!isGovernorPosition) {
        return true;
      }
      
      if (!voterInfo?.department) {
        return false;
      }
      
      const voterDept = voterInfo.department.toLowerCase();
      const positionDept = position.id.split('-')[0].toLowerCase();
      
      return voterDept === positionDept;
    });

    // Validate that each visible position has either candidates or abstain
    const positionsWithoutSelections = visiblePositions.filter((pos) => {
      const isAbstaining = abstainPositions[pos.id] || false;
      const hasCandidates = (selectedCandidates[pos.id] || []).length > 0;
      return !isAbstaining && !hasCandidates;
    });
    
    if (positionsWithoutSelections.length > 0) {
      setErrorModalMessage(
        `Please select candidates or abstain for: ${positionsWithoutSelections.map((p) => p.name).join(", ")}`
      );
      setShowErrorModal(true);
      return;
    }

    // Show review modal
    setShowReviewModal(true);
  }

  function handleProceedFromReview() {
    // Close review modal and show authentication modal
    setShowReviewModal(false);
    setShowAuthModal(true);
    // Pre-fill voter name if available
    if (voterInfo?.fullName) {
      setVoterName(voterInfo.fullName);
    }
  }

  async function handleSubmit() {
    setSuccessMessage(null);
    setErrorMessage(null);

    if (!studentNumber) {
      setErrorMessage("Student number not found. Please log in again.");
      router.push("/login");
      return;
    }

    // Filter positions to only include those visible to the voter
    // (i.e., exclude governor positions that don't match the voter's department)
    const visiblePositions = positions.filter((position) => {
      const isGovernorPosition = position.id.includes('-governor');
      if (!isGovernorPosition) {
        return true; // Show all non-governor positions
      }
      
      // For governor positions, only include if it matches voter's department
      if (!voterInfo?.department) {
        return false; // Hide if no department info
      }
      
      const voterDept = voterInfo.department.toLowerCase();
      const positionDept = position.id.split('-')[0].toLowerCase();
      
      return voterDept === positionDept;
    });

    // Build selections array from visible positions only
    // Include candidates OR abstain for each position
    const selections: Array<{ positionId: string; candidateId: string }> = [];
    visiblePositions.forEach((position) => {
      const isAbstaining = abstainPositions[position.id] || false;
      const selected = selectedCandidates[position.id] || [];
      
      if (isAbstaining) {
        // Add abstain vote
        selections.push({
          positionId: position.id,
          candidateId: "ABSTAIN",
        });
      } else {
        // Add candidate selections
        selected.forEach((candidateId) => {
          selections.push({
            positionId: position.id,
            candidateId,
          });
        });
      }
    });

    if (selections.length === 0) {
      setErrorModalMessage("Please select at least one candidate or abstain for a position.");
      setShowErrorModal(true);
      return;
    }

    // Validate that each visible position has either candidates or abstain
    const positionsWithoutSelections = visiblePositions.filter((pos) => {
      const isAbstaining = abstainPositions[pos.id] || false;
      const hasCandidates = (selectedCandidates[pos.id] || []).length > 0;
      return !isAbstaining && !hasCandidates;
    });
    
    if (positionsWithoutSelections.length > 0) {
      setErrorModalMessage(
        `Please select candidates or abstain for: ${positionsWithoutSelections.map((p) => p.name).join(", ")}`
      );
      setShowErrorModal(true);
      return;
    }

    try {
      setIsSubmitting(true);

      // Check election status and open if needed
      const election = await fetchElection(ELECTION_ID);
      if (!election) {
        throw new Error("Election not found.");
      }
      if (election.status !== "OPEN") {
        if (election.status === "DRAFT") {
          setErrorModalMessage("Election is not open yet. Opening election...");
          setShowErrorModal(true);
          await openElection(ELECTION_ID);
          setShowErrorModal(false);
        } else {
          throw new Error(`Election is ${election.status} and cannot accept votes.`);
        }
      }

      // Register voter if not already registered (will fail silently if already registered)
      try {
        await registerVoter(ELECTION_ID, studentNumber.trim());
      } catch (regErr: any) {
        // If already registered, that's fine - continue
        if (!regErr.message?.includes("already registered")) {
          console.warn("Registration warning:", regErr);
        }
      }

      // Cast the vote
      const voteResponse = await castVote(ELECTION_ID, {
        studentNumber: studentNumber,
        selections,
      });

      // Set timestamp for success modal
      setTransactionTimestamp(new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }));

      // Update voter info in localStorage to mark as voted
      if (typeof window !== "undefined" && voterInfo) {
        const updatedVoter = { ...voterInfo, hasVoted: true };
        localStorage.setItem("voter", JSON.stringify(updatedVoter));
        setVoterInfo(updatedVoter);
      }

      // Close auth modal and show success modal
      setShowAuthModal(false);
      setShowSuccessModal(true);
      setAuthConfirmed(false);
      setVoterName("");
    } catch (err: any) {
      console.error(err);
      
      // Parse error message to show user-friendly messages
      let errorMsg = "Failed to cast vote.";
      const errorText = err.message || err.toString();
      
      if (errorText.includes("already cast") || errorText.includes("already voted") || errorText.includes("hasVoted")) {
        errorMsg = "You have already cast your vote. Each voter can only vote once.";
      } else if (errorText.includes("not eligible") || errorText.includes("isEligible")) {
        errorMsg = "You are not eligible to vote. Please contact the CAS SEB if you believe this is an error.";
      } else if (errorText.includes("not found") || errorText.includes("Voter not found")) {
        errorMsg = "Voter not found in registry. Please contact the CAS SEB.";
      } else if (errorText.includes("CLOSED") || errorText.includes("closed")) {
        errorMsg = "The election is currently closed and is not accepting votes.";
      } else if (errorText.includes("DRAFT") || errorText.includes("not open")) {
        errorMsg = "The election is not open yet. Please wait for the election to begin.";
      } else if (errorText.includes("department") || errorText.includes("Governor")) {
        errorMsg = errorText; // Use the specific department error message
      } else if (errorText.includes("Too many selections")) {
        errorMsg = errorText; // Use the specific max votes error
      } else if (errorText.includes("Invalid candidate") || errorText.includes("Invalid position")) {
        errorMsg = "Invalid selection detected. Please refresh the page and try again.";
      } else {
        errorMsg = errorText || "An unexpected error occurred. Please try again or contact support.";
      }
      
      // Show error in modal instead of inline
      setErrorModalMessage(errorMsg);
      setShowAuthModal(false);
      setShowErrorModal(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleLogout = () => {
    router.push("/login");
  };

  const sidebarUserName = voterInfo?.fullName || "User";

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <StudentVoterSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        active="vote"
        userName={sidebarUserName}
        onLogout={handleLogout}
        fixed
      />

      {/* Main Content */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ${
        sidebarOpen ? "ml-64" : "ml-20"
      }`}>
        <StudentVoterHeader 
          title="Cast Vote" 
          sidebarOpen={sidebarOpen}
          actions={
            studentNumber && (
              <div className="px-3 py-1 bg-gray-100 rounded-md text-sm text-gray-600">
                Student Number: {studentNumber}
              </div>
            )
          }
        />

        {/* Main Content Area */}
        <main className="flex-1 p-6 overflow-y-auto">
          {showInstructions ? (
            <VoteInstructions onContinue={() => setShowInstructions(false)} />
          ) : (
            // Ballot Form
            <div className="max-w-4xl mx-auto">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">Election Ballot</h2>
                  <p className="text-sm text-red-600">
                    *The candidate list is presented in no particular order.
                  </p>
                </div>

                <form onSubmit={handleReviewClick} className="space-y-8">
                  {/* Voter Info Display */}
                  {voterInfo && (
                    <section className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-700">Voter Information</p>
                          <p className="text-sm text-gray-600 mt-1">
                            {voterInfo.fullName} • {voterInfo.program} • Year {voterInfo.yearLevel}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">Student Number: {voterInfo.studentNumber}</p>
                        </div>
                      </div>
                    </section>
                  )}

                  {/* Positions */}
                  {positions
                    .filter((position) => {
                      // Filter governor positions: only show the governor position matching voter's department
                      const isGovernorPosition = position.id.includes('-governor');
                      if (!isGovernorPosition) {
                        return true; // Show all non-governor positions
                      }
                      
                      // For governor positions, only show if it matches voter's department
                      if (!voterInfo?.department) {
                        return false; // Hide if no department info
                      }
                      
                      const voterDept = voterInfo.department.toLowerCase();
                      const positionDept = position.id.split('-')[0].toLowerCase();
                      
                      return voterDept === positionDept;
                    })
                    .map((position) => {
                    const selected = selectedCandidates[position.id] || [];
                    const isRadio = position.maxVotes === 1;
                    const isAbstaining = abstainPositions[position.id] || false;
                    
                    return (
                      <section key={position.id} className="border-b border-gray-200 pb-6 last:border-b-0">
                        <div className="mb-4">
                          <h3 className="text-lg font-semibold text-[#7A0019] mb-1">
                            {position.name}
                          </h3>
                          {!isAbstaining && (
                            <p className="text-sm text-red-600">
                              *Voter shall select at most {position.maxVotes === 3 ? 'THREE' : position.maxVotes === 5 ? 'FIVE' : position.maxVotes === 1 ? 'ONE' : position.maxVotes.toString()} ({position.maxVotes}) candidate{position.maxVotes > 1 ? 's' : ''}.
                            </p>
                          )}
                        </div>

                        <div className="space-y-3">
                          {position.candidates.map((candidate, index) => {
                            const isSelected = selected.includes(candidate.id);
                            return (
                              <label
                                key={candidate.id}
                                className={`flex items-center gap-4 p-5 rounded-lg border-2 transition-all ${
                                  isAbstaining
                                    ? "border-gray-200 bg-gray-50 cursor-not-allowed opacity-50"
                                    : isSelected
                                    ? "border-[#7A0019] bg-red-50 cursor-pointer"
                                    : "border-gray-200 bg-white hover:border-gray-300 cursor-pointer"
                                }`}
                              >
                                <div className="flex-shrink-0">
                                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                                    isSelected ? "bg-[#7A0019]" : "bg-blue-100"
                                  }`}>
                                    <User className={`h-6 w-6 ${
                                      isSelected ? "text-white" : "text-blue-600"
                                    }`} />
                                  </div>
                                </div>
                                <div className="flex-1 flex items-center gap-1">
                                  <p className="font-semibold text-gray-900 text-base tracking-wide">
                                    {index + 1}. {candidate.name.toUpperCase()}
                                  </p>

                                  {candidate.party && (
                                    <span
                                      className={`ml-4 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                                        candidate.party.toUpperCase() === "PMB"
                                          ? "bg-blue-100 text-blue-700"
                                          : candidate.party.toUpperCase() === "SAMASA"
                                          ? "bg-red-100 text-red-700"
                                          : "bg-yellow-100 text-yellow-800"
                                      }`}
                                    >
                                      {candidate.party.toUpperCase()}
                                    </span>
                                  )}
                                </div>
                                <div className="flex-shrink-0">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    disabled={isAbstaining}
                                    onChange={() =>
                                      handleCandidateToggle(position.id, candidate.id, position.maxVotes)
                                    }
                                    className={`h-5 w-5 text-[#7A0019] focus:ring-[#7A0019] border-gray-300 rounded ${
                                      isAbstaining ? "cursor-not-allowed opacity-50" : ""
                                    }`}
                                  />
                                </div>
                              </label>
                            );
                          })}
                          
                          {/* Abstain Option */}
                          <label
                            className={`flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all mt-3 ${
                              abstainPositions[position.id]
                                ? "border-gray-500 bg-gray-100"
                                : "border-gray-200 bg-white hover:border-gray-300"
                            }`}
                          >
                            <div className="flex-shrink-0">
                              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                                abstainPositions[position.id] ? "bg-gray-500" : "bg-gray-100"
                              }`}>
                                <XCircle className={`h-6 w-6 ${
                                  abstainPositions[position.id] ? "text-white" : "text-gray-600"
                                }`} />
                              </div>
                            </div>
                            <div className="flex-1">
                              <p className="font-semibold text-gray-900">
                                Abstain
                              </p>
                              <p className="text-sm text-gray-600">
                                I choose not to vote for any candidate in this position
                              </p>
                            </div>
                            <div className="flex-shrink-0">
                              <input
                                type="checkbox"
                                checked={abstainPositions[position.id] || false}
                                onChange={() => handleAbstainToggle(position.id)}
                                className="h-5 w-5 text-gray-500 focus:ring-gray-500 border-gray-300 rounded"
                              />
                            </div>
                          </label>
                        </div>
                        {selected.length > 0 && !abstainPositions[position.id] && (
                          <p className="text-sm text-gray-500 mt-2">
                            {selected.length} of {position.maxVotes} selected
                          </p>
                        )}
                        {abstainPositions[position.id] && (
                          <p className="text-sm text-gray-500 mt-2">
                            Abstaining from this position
                          </p>
                        )}
                      </section>
                    );
                  })}

                  {/* Messages */}
                  {successMessage && (
                    <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
                      {successMessage}
                    </div>
                  )}
                  {/* Submit */}
                  <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                    <Button
                      type="button"
                      variant="outline"
                      className="cursor-pointer"
                      onClick={() => setShowInstructions(true)}
                    >
                      ← Back to Instructions
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="bg-[#7A0019] hover:bg-[#8a0019] text-white px-8 py-2 cursor-pointer"
                    >
                      {isSubmitting ? "Submitting…" : "Submit Ballot"}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Vote Modals */}
      <VoteModals
        showReviewModal={showReviewModal}
        setShowReviewModal={setShowReviewModal}
        showAuthModal={showAuthModal}
        setShowAuthModal={setShowAuthModal}
        showSuccessModal={showSuccessModal}
        setShowSuccessModal={setShowSuccessModal}
        showErrorModal={showErrorModal}
        setShowErrorModal={setShowErrorModal}
        positions={positions}
        selectedCandidates={selectedCandidates}
        abstainPositions={abstainPositions}
        voterInfo={voterInfo}
        isSubmitting={isSubmitting}
        authConfirmed={authConfirmed}
        setAuthConfirmed={setAuthConfirmed}
        voterName={voterName}
        setVoterName={setVoterName}
        errorModalMessage={errorModalMessage}
        transactionTimestamp={transactionTimestamp}
        onProceedFromReview={handleProceedFromReview}
        onSubmit={handleSubmit}
        onNavigateToDashboard={() => router.push("/studentvoter")}
      />
    </div>
  );
}
