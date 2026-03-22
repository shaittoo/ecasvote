"use client";

/**
 * TAMA / MALI visual guide — uses official graphic from public/voteright.png
 */

export function BallotMarkingGuide() {
  return (
    <aside
      className="w-[52%] max-w-[180px] shrink-0 border-2 border-black bg-white p-0.5 print:max-w-[160px] print:p-0"
      aria-label="How to mark the ballot correctly (TAMA / MALI)"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static asset; reliable in print preview */}
      <img
        src="/voteright.png"
        alt="Tamang pagmarka: buong itim na oval ang TAMA. Mali ang partial shade, tuldok, check, X, at guhit."
        className="mx-auto block h-auto w-full max-h-[88px] object-contain print:max-h-[72px]"
        width={160}
        height={80}
      />
    </aside>
  );
}
