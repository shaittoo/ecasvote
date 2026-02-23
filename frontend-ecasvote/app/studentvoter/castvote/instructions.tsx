"use client";

import { Button } from "@/components/ui/button";

interface VoteInstructionsProps {
  onContinue: () => void;
}

export function VoteInstructions({ onContinue }: VoteInstructionsProps) {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">How to Cast Your Ballot</h2>
        
        <div className="space-y-6">
          {/* Step 1 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white font-semibold">
                1
              </div>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-2">Select Your Candidate</h3>
              <p className="text-gray-600 text-sm">
                Click on your favored candidate for each position. For positions that allow multiple selections, 
                you can select up to the maximum number indicated.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white font-semibold">
                2
              </div>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-2">Affix E-Signature</h3>
              <p className="text-gray-600 text-sm">
                After making your selections, click the "Confirm" button. You will be prompted for a digital 
                confirmation. This is not a written signature, but a digital confirmation of your choices.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white font-semibold">
                3
              </div>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-2">Submit Ballot</h3>
              <p className="text-gray-600 text-sm">
                Once you have confirmed your selections, click the "Submit Ballot" button to finalize your vote. 
                Your vote will be recorded on the blockchain and cannot be changed.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <Button
            onClick={onContinue}
            className="bg-[#7A0019] hover:bg-[#8a0019] text-white px-8 py-2 cursor-pointer"
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
