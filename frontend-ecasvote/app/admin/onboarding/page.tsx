"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Search,
  ChevronDown,
  Check,
  BookOpen,
  HelpCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AdminSidebar } from "@/components/Sidebar";
import AdminHeader from "../components/header";
import { cn } from "@/lib/utils";

// ============ TYPES ============
type Step = {
  id: number;
  title: string;
  intro: string;
  details?: string;
  instructions: string[];
};

type FAQ = {
  id: number;
  question: string;
  answer: string;
  category: "election" | "voter" | "token" | "security" | "results";
};

// ============ DATA ============
const STEPS: Step[] = [
  {
    id: 1,
    title: "Create the Election and Add Candidates",
    intro:
      "Every new election starts as a draft. While the election is in draft, you can set it up — adding positions, candidates, and the voter list. The election cannot start until everything is in place.",
    details:
      "Once you save the election with its title, dates, and other details, the system prepares it for setup. Candidates must be added before voting begins.",
    instructions: [
      "Go to Election Management and click Create New Election.",
      "Fill in the title, academic year, semester, start date, and end date, then save.",
      "Open Candidate Management and add each candidate one by one — provide their position, name, and political party.",
      "Review your candidate list before moving on to the voter roster.",
    ],
  },
  {
    id: 2,
    title: "Import the Voter Roster",
    intro:
      "Each election has its own voter list. You must select the election you are setting up before importing — otherwise the voters will not be linked to your election.",
    details:
      "The easiest way is to download the template, fill it in with your voters' details, and upload it back. The system will read the file and add everyone to the selected election.",
    instructions: [
      "Open Voter Management → Voter Roster.",
      "Select your election from the dropdown at the top of the page. The Import button stays disabled until you do.",
      "Click Download Template to get a pre-formatted file with the right columns.",
      "Fill in your voters' details: student number, full name, UP Mail, college, program, year level, organization, enrollment status, semester, and academic year.",
      "Click Import Roster and upload your filled-in file. Review the imported list once it loads.",
    ],
  },
  {
    id: 3,
    title: "Generate Voting Tokens",
    intro:
      "Each voter on your list needs a single-use token. The token links a voter to one paper ballot and is used up the moment that ballot is submitted.",
    details:
      "Tokens belong to a specific election. The system records when each token is created and when it is used. A used token cannot be reused.",
    instructions: [
      "Open Voter Management → Token Status.",
      "Make sure the correct election is selected.",
      "Click Generate Tokens for All.",
      "Track issuance and usage from this page throughout the election.",
    ],
  },
  {
    id: 4,
    title: "Election Opens Automatically",
    intro:
      "The election starts on its own at the date and time you set in Step 1. You do not need to open it manually.",
    details:
      "Before the start date arrives, make sure all your setup is complete: candidates added, voter roster imported, and tokens generated. Once the election is open, you cannot change the candidate list or the voter roster.",
    instructions: [
      "Confirm your setup is complete well before the scheduled start date.",
      "When the start time arrives, the system opens the election automatically.",
      "Ballot scanning becomes available as soon as the election is open.",
      "If you need to change the schedule, edit the start or end date while the election is still in draft.",
    ],
  },
  {
    id: 5,
    title: "Print Ballots and Scan Submissions",
    intro:
      "Voters fill out paper ballots that you print from the Voter Roster page. The SEB scans each completed ballot and reviews it with the voter face-to-face before submitting it.",
    details:
      "Each printed ballot has a QR code linked to that specific voter's token. The scanner reads the bubbles the voter filled in and decodes the QR code, then the system records the vote.",
    instructions: [
      "On the Voter Roster page, click Print Ballot beside a voter's name to print their personalized ballot.",
      "Open the Ballot Scanning page and place the filled paper ballot in the scanner.",
      "The scanner shows the choices it detected. Show this review screen to the voter.",
      "Once the voter confirms their choices, click Confirm. The system records the vote and marks the token as used.",
      "If the scan fails, the ballot is not recorded and the token can still be used. Try scanning the ballot again.",
    ],
  },
  {
    id: 6,
    title: "Monitor Turnout and Verify Integrity",
    intro:
      "While voting is open, you can track how many people have voted and check that the records match across the system. Live tally numbers stay hidden until results are published.",
    details:
      "The Integrity Check tool compares the official vote record with the system's internal records. If they don't match, you can review the difference and correct it.",
    instructions: [
      "Open Tally & Results → Voter Turnout to see participation by college, program, and year level.",
      "Use the Audit Trail Viewer to look at the history of system actions if you need to investigate something.",
      "Run an Integrity Check from time to time. If a difference shows up, review it carefully before correcting.",
    ],
  },
  {
    id: 7,
    title: "Election Closes Automatically and Publishing Results",
    intro:
      "The election closes on its own at the end date and time you set in Step 1. Closing the election finalizes the tally, but results are not shown to students until you publish them.",
    details:
      "Candidate lists and final results are published separately. You can make the candidate list public during the campaign period, and hold the results until the SEB and Advisers approve the release.",
    instructions: [
      "When the end time arrives, the system closes the election automatically and finalizes the tally.",
      "Review the Results Summary and Detailed Statistics to confirm the official numbers.",
      "When the SEB and Advisers approve, turn on Publish Results to make the tally visible to students.",
      "Turn on Publish Candidates separately if the candidate list was not already public.",
    ],
  },
];

const FAQS: FAQ[] = [
  {
    id: 1,
    category: "election",
    question: "Who can create and configure an election?",
    answer:
      "Only SEB administrators can create elections, add candidates, and manage voter lists. Advisers have read-only access — they can monitor and review the election but cannot make changes.",
  },
  {
    id: 2,
    category: "election",
    question: "Can I edit an election after it has been created?",
    answer:
      "Yes — but only while the election is still in draft. Once the election opens on its scheduled start date, the candidate list and voter roster are locked. Schedule changes also have to be made before the election opens.",
  },
  {
    id: 3,
    category: "election",
    question: "Does the election open and close automatically?",
    answer:
      "Yes. The election starts automatically at the scheduled start date and time, and closes automatically at the scheduled end date. You don't need to open or close it manually, but make sure all setup is complete before the start date.",
  },
  {
    id: 4,
    category: "voter",
    question: "What information do I need in my voter file?",
    answer:
      "Each voter row should include their student number, full name, UP Mail address, college, program, year level, organization, enrollment status, semester, and academic year. The easiest way is to click Download Template on the Voter Roster page — it gives you a pre-formatted file with the right columns to fill in.",
  },
  {
    id: 5,
    category: "voter",
    question: "Why didn't my imported voters appear in the election?",
    answer:
      "The most common reason is forgetting to select the election from the dropdown before importing. Without choosing the election first, the system has no way to know which election the voters belong to. Re-import after selecting the correct election.",
  },
  {
    id: 6,
    category: "voter",
    question: "Can a voter participate in more than one election at the same time?",
    answer:
      "Yes. Voter lists are kept per election, so the same student can be enrolled in multiple elections happening at the same time — for example, a university-wide election and a college-level one. Each election tracks their participation separately.",
  },
  {
    id: 7,
    category: "token",
    question: "What is a voting token and why is it needed?",
    answer:
      "Each voter receives a single-use token tied to one paper ballot. The token is printed as a QR code on the ballot. When the SEB scans the ballot, the system reads the QR code to make sure the voter has not already voted.",
  },
  {
    id: 8,
    category: "token",
    question: "Can a token be reused or reissued?",
    answer:
      "No. Once a token has been used after a successful scan, it cannot be reissued for the same voter in the same election. If a ballot is spoiled before submission, contact the SEB to follow the manual override process.",
  },
  {
    id: 9,
    category: "security",
    question: "How are votes kept anonymous?",
    answer:
      "A voter's identity is never linked to their selections in any public record. The encrypted ballot is stored privately and only authorized SEB staff can access it. The link between voter and ballot is broken at the moment the vote is cast.",
  },
  {
    id: 10,
    category: "security",
    question: "What happens if a ballot scan fails?",
    answer:
      "If the scan or submission fails, the ballot is not recorded and the token can still be used. The SEB can simply scan the same ballot again. Failed attempts are logged for review.",
  },
  {
    id: 11,
    category: "security",
    question: "How can I verify the election results are accurate?",
    answer:
      "Use the Integrity Check tool under Audit & Logs. It compares the official vote record with the system's internal records in real time. If a difference shows up, review the audit trail carefully before correcting it.",
  },
  {
    id: 12,
    category: "results",
    question: "When are results visible to students?",
    answer:
      "Never automatically. Results stay hidden until the SEB turns on the Publish Results option, which happens after the election closes and Advisers approve the release. Closing an election only finalizes the tally — it does not make results public.",
  },
];

// ============ HIGHLIGHT HELPER ============
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-gray-900 font-semibold px-0.5 rounded-sm">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ============ TAG STYLES ============
const TAG_STYLES: Record<FAQ["category"], string> = {
  election: "bg-amber-100 text-amber-800",
  voter: "bg-emerald-100 text-emerald-800",
  token: "bg-indigo-100 text-indigo-800",
  security: "bg-[#7A0019]/10 text-[#7A0019]",
  results: "bg-orange-100 text-orange-800",
};

// ============ COMPONENT ============
export default function HelpCenterPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [openSteps, setOpenSteps] = useState<Set<number>>(new Set([1]));
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [openFaqs, setOpenFaqs] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  const handleLogout = () => {
    router.push("/login");
  };

  const toggleStep = (id: number) => {
    setOpenSteps((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleFaq = (id: number) => {
    setOpenFaqs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleDone = (id: number) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ============ SEARCH ============
  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;

  useEffect(() => {
    if (isSearching) {
      const target = document.getElementById("onboarding");
      if (target) {
        const rect = target.getBoundingClientRect();
        if (rect.top > 200 || rect.top < -100) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    }
  }, [isSearching]);

  const filteredSteps = useMemo(() => {
    if (!isSearching) return STEPS;
    return STEPS.filter((s) => {
      const haystack = [s.title, s.intro, s.details ?? "", ...s.instructions]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [query, isSearching]);

  const filteredFaqs = useMemo(() => {
    if (!isSearching) return FAQS;
    return FAQS.filter((f) =>
      `${f.question} ${f.answer} ${f.category}`.toLowerCase().includes(query)
    );
  }, [query, isSearching]);

  const totalResults = filteredSteps.length + filteredFaqs.length;
  const totalArticles = STEPS.length + FAQS.length;
  const progressPct = (completed.size / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AdminSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        active="onboarding"
        userName="Admin"
        onLogout={handleLogout}
        fixed
        pathname={pathname}
      />

      <div className="flex-1 flex flex-col">
        <AdminHeader 
        title="Help Center" 
        subtitle="Setup guides, FAQs, and references for SEB members and Advisers"
        sidebarOpen={sidebarOpen} />

        <main
          className={`flex-1 p-6 overflow-y-auto transition-all duration-300 ${
            sidebarOpen ? "ml-64" : "ml-20"
          }`}
        >
          <div className="max-w-7xl mx-auto space-y-6">
            {/* HERO */}
            <div className="space-y-3 text-center">
              <h1 className="text-3xl font-bold tracking-tight">
                <span className="text-[#EACE09]">Secure.</span>{" "}
                <span className="text-[#7A0019]">Transparent.</span>{" "}
                <span className="text-emerald-700">Accountable Election.</span>
              </h1>
              <p className="text-sm text-gray-600 max-w-7xl leading-relaxed text-center mx-auto">
                The official platform for configuring, managing, and validating Student Council
                Elections at UP Visayas — College of Arts and Sciences. Find guides, references,
                and support below.
              </p>
            </div>

            {/* SEARCH */}
            <Card>
              <CardContent className="pt-6">
                <h2 className="text-center text-xl font-semibold mb-4">How can we help you?</h2>
                <div className="relative max-w-2xl mx-auto">
                  <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search guides and FAQs…"
                    className="h-10 w-full pl-9 pr-28"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground tabular-nums">
                    {isSearching
                      ? `${totalResults} ${totalResults === 1 ? "result" : "results"}`
                      : `${totalArticles} articles`}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() =>
                  document.getElementById("onboarding")?.scrollIntoView({ behavior: "smooth" })
                }
                className="text-left rounded-lg border border-gray-200 bg-white p-6 hover:border-emerald-600 hover:shadow-md transition-all cursor-pointer"
              >
                <BookOpen className="h-8 w-8 text-emerald-700 mb-3" />
                <h3 className="text-lg font-semibold mb-1">Onboarding</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  A step-by-step setup guide for SEB members and Advisers — from creating an
                  election to publishing results.
                </p>
              </button>
              <button
                type="button"
                onClick={() =>
                  document.getElementById("faqs")?.scrollIntoView({ behavior: "smooth" })
                }
                className="text-left rounded-lg border border-gray-200 bg-white p-6 hover:border-emerald-600 hover:shadow-md transition-all cursor-pointer"
              >
                <HelpCircle className="h-8 w-8 text-emerald-700 mb-3" />
                <h3 className="text-lg font-semibold mb-1">FAQs</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Frequently asked questions about election rules, voter eligibility, token
                  issuance, and security guarantees.
                </p>
              </button>
            </div>

            {/* ONBOARDING */}
            <Card id="onboarding">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                  <CardTitle className="text-2xl text-emerald-700">Onboarding</CardTitle>
                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                      Setup Progress
                    </div>
                    <div className="text-base font-semibold">
                      {completed.size}
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        of {STEPS.length} steps
                      </span>
                    </div>
                    <div className="w-44 h-1.5 bg-gray-200 rounded-full mt-1.5 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-600 to-amber-500 transition-all duration-500"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {filteredSteps.length === 0 ? (
                  <div className="py-12 text-center text-sm text-gray-500 border border-dashed border-gray-200 rounded-md">
                    No onboarding steps match &ldquo;{searchQuery}&rdquo;.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200 border-t border-b border-gray-200">
                    {filteredSteps.map((step) => {
                      const isOpen = isSearching || openSteps.has(step.id);
                      const isDone = completed.has(step.id);
                      return (
                        <div key={step.id}>
                          <button
                            type="button"
                            onClick={() => toggleStep(step.id)}
                            className="w-full flex items-center gap-4 py-4 text-left hover:bg-gray-50 transition-colors px-2 -mx-2 rounded"
                          >
                            <div
                              className={cn(
                                "w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                                isDone
                                  ? "bg-emerald-600 border-emerald-600"
                                  : "border-gray-300 bg-white"
                              )}
                            >
                              {isDone && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                            </div>
                            <span className="text-xs font-semibold text-gray-400 tabular-nums w-7 shrink-0">
                              {String(step.id).padStart(2, "0")}
                            </span>
                            <span className="flex-1 text-base font-semibold text-[#7A0019]">
                              <Highlight text={step.title} query={query} />
                            </span>
                            <ChevronDown
                              className={cn(
                                "h-5 w-5 text-[#7A0019] transition-transform shrink-0",
                                isOpen && "rotate-180"
                              )}
                            />
                          </button>
                          {isOpen && (
                            <div className="pl-[68px] pr-2 pb-6 pt-1">
                              <div className="text-sm text-gray-600 leading-relaxed space-y-3">
                                <p>
                                  <Highlight text={step.intro} query={query} />
                                </p>
                                {step.details && (
                                  <p>
                                    <Highlight text={step.details} query={query} />
                                  </p>
                                )}
                                <ol className="space-y-2 mt-3">
                                  {step.instructions.map((inst, i) => (
                                    <li key={i} className="flex gap-3 items-start">
                                      <span className="shrink-0 w-5 h-5 rounded-full bg-[#7A0019]/10 text-[#7A0019] text-[10px] font-bold flex items-center justify-center mt-0.5">
                                        {i + 1}
                                      </span>
                                      <span>
                                        <Highlight text={inst} query={query} />
                                      </span>
                                    </li>
                                  ))}
                                </ol>
                              </div>
                              <button
                                type="button"
                                onClick={() => toggleDone(step.id)}
                                className={cn(
                                  "mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-md border text-xs font-semibold transition-colors cursor-pointer",
                                  isDone
                                    ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                                    : "border-emerald-600 text-emerald-700 hover:bg-emerald-600 hover:text-white"
                                )}
                              >
                                <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                                {isDone ? "Done" : "Mark as done"}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* FAQs */}
            <Card id="faqs">
              <CardHeader>
                <div className="flex items-end justify-between">
                  <CardTitle className="text-2xl text-[#7A0019]">
                    Frequently Asked Questions
                  </CardTitle>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold pb-1">
                    {isSearching
                      ? `${filteredFaqs.length} matching`
                      : `${FAQS.length} questions`}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {filteredFaqs.length === 0 ? (
                  <div className="py-12 text-center text-sm text-gray-500 border border-dashed border-gray-200 rounded-md">
                    No FAQs match &ldquo;{searchQuery}&rdquo;.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200 border-t border-b border-gray-200">
                    {filteredFaqs.map((faq) => {
                      const isOpen = isSearching || openFaqs.has(faq.id);
                      return (
                        <div key={faq.id}>
                          <button
                            type="button"
                            onClick={() => toggleFaq(faq.id)}
                            className="w-full flex items-center gap-3 py-4 text-left hover:bg-gray-50 transition-colors px-2 -mx-2 rounded"
                          >
                            <span
                              className={cn(
                                "shrink-0 w-16 text-center text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded",
                                TAG_STYLES[faq.category]
                              )}
                            >
                              {faq.category}
                            </span>
                            <span className="flex-1 text-sm font-medium text-gray-900">
                              <Highlight text={faq.question} query={query} />
                            </span>
                            <ChevronDown
                              className={cn(
                                "h-5 w-5 text-gray-400 transition-transform shrink-0",
                                isOpen && "rotate-180 text-[#7A0019]"
                              )}
                            />
                          </button>
                          {isOpen && (
                            <div className="pl-[88px] pr-2 pb-5 -mt-1">
                              <p className="text-sm text-gray-600 leading-relaxed">
                                <Highlight text={faq.answer} query={query} />
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}