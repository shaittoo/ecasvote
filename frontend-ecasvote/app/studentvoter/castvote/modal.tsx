"use client";

import { X, XCircle, CheckCircle2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Position } from "@/lib/ecasvoteApi";

interface VoteModalsProps {
  showReviewModal: boolean;
  setShowReviewModal: (value: boolean) => void;
  showAuthModal: boolean;
  setShowAuthModal: (value: boolean) => void;
  showSuccessModal: boolean;
  setShowSuccessModal: (value: boolean) => void;
  showErrorModal: boolean;
  setShowErrorModal: (value: boolean) => void;
  positions: Position[];
  selectedCandidates: Record<string, string[]>;
  abstainPositions: Record<string, boolean>;
  voterInfo: any;
  isSubmitting: boolean;
  authConfirmed: boolean;
  setAuthConfirmed: (value: boolean) => void;
  voterName: string;
  setVoterName: (value: string) => void;
  errorModalMessage: string;
  transactionTimestamp: string | null;
  onProceedFromReview: () => void;
  onSubmit: () => void;
  onNavigateToDashboard: () => void;
}

export function VoteModals({
  showReviewModal,
  setShowReviewModal,
  showAuthModal,
  setShowAuthModal,
  showSuccessModal,
  setShowSuccessModal,
  showErrorModal,
  setShowErrorModal,
  positions,
  selectedCandidates,
  abstainPositions,
  voterInfo,
  isSubmitting,
  authConfirmed,
  setAuthConfirmed,
  voterName,
  setVoterName,
  errorModalMessage,
  transactionTimestamp,
  onProceedFromReview,
  onSubmit,
  onNavigateToDashboard,
}: VoteModalsProps) {
  return (
    <>
      {/* Review Vote Modal */}
      {showReviewModal && (
        <div 
          className="fixed inset-0 bg-gray bg-opacity-20 backdrop-blur-md flex items-center justify-center z-50"
          onClick={() => setShowReviewModal(false)}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-green-600">Review your Vote</h2>
              <button
                onClick={() => setShowReviewModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
              >
                <X className="h-6 w-6 cursor-pointer" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {positions
                .filter((position) => {
                  const isGovernorPosition = position.id.includes('-governor');
                  if (!isGovernorPosition) return true;
                  if (!voterInfo?.department) return false;
                  const voterDept = voterInfo.department.toLowerCase();
                  const positionDept = position.id.split('-')[0].toLowerCase();
                  return voterDept === positionDept;
                })
                .map((position) => {
                  const selected = selectedCandidates[position.id] || [];
                  const isAbstaining = abstainPositions[position.id] || false;
                  
                  // Skip positions with no selections
                  if (!isAbstaining && selected.length === 0) {
                    return null;
                  }

                  return (
                    <div key={position.id} className="border-b border-gray-200 pb-4 last:border-b-0">
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">{position.name}</h3>
                      
                      {isAbstaining ? (
                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                          <div className="w-10 h-10 rounded-full bg-gray-400 flex items-center justify-center">
                            <XCircle className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">Abstain</p>
                            <p className="text-sm text-gray-600">No candidate selected for this position</p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {selected.map((candidateId) => {
                            const candidate = position.candidates.find(c => c.id === candidateId);
                            if (!candidate) return null;
                            
                            const partyColors: Record<string, { bg: string; text: string }> = {
                              'PMB': { bg: 'bg-blue-100', text: 'text-blue-700' },
                              'SAMASA': { bg: 'bg-red-100', text: 'text-red-700' },
                              'INDEPENDENT': { bg: 'bg-gray-100', text: 'text-gray-700' },
                            };
                            const partyColor = partyColors[candidate.party?.toUpperCase() || ''] || partyColors['INDEPENDENT'];
                            
                            return (
                              <div key={candidateId} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                  candidate.party === 'PMB' ? 'bg-blue-200' :
                                  candidate.party === 'SAMASA' ? 'bg-red-200' :
                                  'bg-yellow-200'
                                }`}>
                                  <User className="h-5 w-5 text-gray-700" />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="font-semibold text-gray-900">
                                      {candidate.name.toUpperCase()}
                                    </p>
                                    {candidate.party && (
                                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${partyColor.bg} ${partyColor.text}`}>
                                        {candidate.party.toUpperCase()}
                                      </span>
                                    )}
                                    <div className="ml-auto">
                                      <div className="w-5 h-5 border-2 border-green-500 rounded bg-green-50 flex items-center justify-center">
                                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowReviewModal(false)}
                className="px-6 cursor-pointer"
              >
                Cancel Submission
              </Button>
              <Button
                type="button"
                onClick={onProceedFromReview}
                className="bg-[#7A0019] hover:bg-[#8a0019] text-white px-8 cursor-pointer"
              >
                Proceed
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Vote Authentication Modal */}
      {showAuthModal && (
        <div 
          className="fixed inset-0 bg-gray bg-opacity-20 backdrop-blur-md flex items-center justify-center z-50"
          onClick={() => {
            setShowAuthModal(false);
            setAuthConfirmed(false);
            setVoterName("");
          }}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-green-600">Vote Authentication</h2>
              <button
                onClick={() => {
                  setShowAuthModal(false);
                  setAuthConfirmed(false);
                  setVoterName("");
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
              >
                <X className="h-6 w-6 cursor-pointer" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              <p className="text-gray-700">
                Please check the box below to formally acknowledge and confirm the following:
              </p>

              <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={authConfirmed}
                    onChange={(e) => setAuthConfirmed(e.target.checked)}
                    className="mt-1 h-5 w-5 text-[#7A0019] focus:ring-[#7A0019] border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700 leading-relaxed">
                    I hereby confirm that this ballot accurately reflects my own, uncoerced choices, cast solely by me and without the influence or instruction of any external party. By ticking this box, I attest to the authenticity and integrity of my selections, and I authorize the eCASVote system to immutably record this vote on the Blockchain Ledger for verifiable inclusion in the official election tally.
                  </span>
                </label>
              </div>

              <div>
                <label htmlFor="voterName" className="block text-sm font-medium text-gray-700 mb-2">
                  Your Name
                </label>
                <Input
                  id="voterName"
                  type="text"
                  value={voterName}
                  onChange={(e) => setVoterName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowAuthModal(false);
                  setAuthConfirmed(false);
                  setVoterName("");
                }}
                className="px-6 cursor-pointer"
              >
                Cancel Submission
              </Button>
              <Button
                type="button"
                onClick={onSubmit}
                disabled={isSubmitting || !authConfirmed || !voterName.trim()}
                className="bg-[#7A0019] hover:bg-[#8a0019] text-white px-8 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? "Submitting…" : "Confirm Submission"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Success Confirmation Modal */}
      {showSuccessModal && (
        <div 
          className="fixed inset-0 bg-gray bg-opacity-20 backdrop-blur-md flex items-center justify-center z-50"
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-3xl font-bold text-green-700">Vote Successfully Recorded!</h2>
              <button
                onClick={() => {
                  setShowSuccessModal(false);
                  onNavigateToDashboard();
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
              >
                <X className="h-6 w-6 cursor-pointer" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-8 space-y-6">
              {/* Confirmation Points */}
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-white" />
                  </div>
                  <p className="text-gray-700 pt-1">
                    Your vote has been securely and immutably recorded on the blockchain ledger.
                  </p>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-gray-700 pt-1">
                      Your voter token is now officially marked as used.
                    </p>
                    <p className="text-purple-400 text-xs mt-1">Slot</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-white" />
                  </div>
                  <p className="text-gray-700 pt-1">
                    Your vote is final and cannot be altered.
                  </p>
                </div>
              </div>

              {/* Additional Information */}
              <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Information</h3>
                <div className="space-y-3">
                  <div>
                    <span className="font-medium text-gray-700">Time Stamp:</span>
                    <span className="ml-2 text-gray-600">{transactionTimestamp || "Processing..."}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Status:</span>
                    <span className="ml-2 text-gray-600">Recorded in CAS SC Elections 2026</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-end">
              <Button
                type="button"
                onClick={() => {
                  setShowSuccessModal(false);
                  onNavigateToDashboard();
                }}
                className="bg-green-700 hover:bg-green-800 text-white px-8"
              >
                Go Back To Dashboard
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {showErrorModal && (
        <div 
          className="fixed inset-0 bg-gray bg-opacity-20 backdrop-blur-md flex items-center justify-center z-50"
          onClick={() => setShowErrorModal(false)}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-red-600">Vote Submission Error</h2>
              <button
                onClick={() => setShowErrorModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-6 w-6 cursor-pointer" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800 font-medium mb-2">Error:</p>
                <p className="text-red-700">{errorModalMessage}</p>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-yellow-800 text-sm leading-relaxed">
                  <strong>Important:</strong> If you have already cast your vote and believe this is an error in the system, 
                  please contact the SEB Administration. They will investigate and resolve the issue for you.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-end">
              <Button
                type="button"
                onClick={() => setShowErrorModal(false)}
                className="bg-[#7A0019] hover:bg-[#8a0019] text-white px-8 cursor-pointer"
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
