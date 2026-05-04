"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { getGatewayBase, login } from "@/lib/ecasvoteApi";

const SEB_EMAIL = "upvcasseb@gmail.com";

export default function LoginPage() {
  const [upMail, setUpMail] = useState("");
  const [username, setUsername] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const router = useRouter();

  // Clear auth state when visiting login page (acts as logout)
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("voter");
      localStorage.removeItem("studentNumber");
      localStorage.removeItem("admin");
      localStorage.removeItem("validator");
      document.cookie = "ecasvote_role=; path=/; max-age=0";
    }
  }, []);

  // Close modal on Escape
  useEffect(() => {
    if (!showHelpModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowHelpModal(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showHelpModal]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (!upMail.trim() || !username.trim()) {
        setError("Please fill in all fields");
        setIsSubmitting(false);
        return;
      }

      if (!upMail.includes("@up.edu.ph")) {
        setError("Please enter a valid UP Mail address");
        setIsSubmitting(false);
        return;
      }

      // Auto-detect role: try student, then admin, then validator
      try {
        const response = await login(username.trim(), upMail.trim());
        if (typeof window !== "undefined") {
          localStorage.setItem("voter", JSON.stringify(response.voter));
          localStorage.setItem("studentNumber", response.voter.studentNumber);
          document.cookie = "ecasvote_role=student; path=/; max-age=28800; SameSite=Lax";
        }
        router.push("/studentvoter");
        return;
      } catch {
        // fall through to admin/validator
      }

      const adminResponse = await fetch(`${getGatewayBase()}/login/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: upMail.trim(), password: username.trim() }),
      });

      if (adminResponse.ok) {
        const data = await adminResponse.json();
        if (typeof window !== "undefined") {
          localStorage.setItem("admin", JSON.stringify(data.admin || { role: "ADMIN" }));
          document.cookie = "ecasvote_role=admin; path=/; max-age=28800; SameSite=Lax";
        }
        router.push("/admin");
        return;
      }

      const validatorResponse = await fetch(`${getGatewayBase()}/login/validator`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: upMail.trim(), password: username.trim() }),
      });

      if (!validatorResponse.ok) {
        const errorData = await validatorResponse.json();
        throw new Error(errorData.error || "Login failed");
      }

      const data = await validatorResponse.json();
      if (typeof window !== "undefined") {
        localStorage.setItem("validator", JSON.stringify(data.validator || { role: "VALIDATOR" }));
        document.cookie = "ecasvote_role=validator; path=/; max-age=28800; SameSite=Lax";
      }
      router.push("/validator");
    } catch (err: any) {
      let errorMessage = "Login failed. Please try again.";
      try {
        const errorData = JSON.parse(err.message);
        errorMessage = errorData.error || errorMessage;
      } catch {
        errorMessage = err.message || errorMessage;
      }
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-white flex">
      {/* Left side - Logo */}
      <div className="hidden md:flex md:w-1/2 items-center justify-center bg-white">
        <div className="text-center">
          <div className="mb-6">
            <Image
              src="/ecasvotelogo.jpeg"
              alt="eCASVote Logo"
              width={800}
              height={400}
              className="mx-auto"
              priority
            />
            <p className="text-lg text-slate-600 mt-4 font-medium">
              Where your vote truly matters.
            </p>
          </div>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="w-full md:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg">
          <div className="p-8">
            <h2 className="text-xl font-bold text-slate-900 mb-6">
              Log in to your account
            </h2>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* UP Mail Field */}
              <div>
                <label
                  htmlFor="upMail"
                  className="block text-sm font-medium text-slate-700 mb-2"
                >
                  UP Mail
                </label>
                <input
                  id="upMail"
                  type="email"
                  value={upMail}
                  onChange={(e) => setUpMail(e.target.value)}
                  placeholder="johndoe@up.edu.ph"
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600"
                  required
                />
              </div>

              {/* Student Number or Password Field */}
              <div>
                <label
                  htmlFor="username"
                  className="block text-sm font-medium text-slate-700 mb-2"
                >
                  Student Number or Password
                </label>
                <input
                  id="username"
                  type="password"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="2021-00001"
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600"
                  required
                />
              </div>

              {/* Help Link — opens proper modal, not browser alert */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowHelpModal(true)}
                  className="text-sm text-slate-600 hover:text-red-600 flex items-center gap-1 cursor-pointer"
                >
                  <span className="text-slate-500">?</span>
                  <span>How do I log in?</span>
                </button>
              </div>

              {/* Error Message */}
              {error && (
                <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Login Button */}
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-red-700 hover:bg-red-800 text-white font-semibold px-8 py-3 rounded-lg shadow-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isSubmitting ? "Logging in..." : "Login"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Help Modal */}
      {showHelpModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="help-modal-title"
          onClick={() => setShowHelpModal(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start justify-between">
                <h3
                  id="help-modal-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  How do I log in?
                </h3>
                <button
                  type="button"
                  onClick={() => setShowHelpModal(false)}
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
                  aria-label="Close"
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <div className="mt-4 space-y-4 text-sm text-slate-700">
                <div>
                  <p className="font-medium text-slate-900 mb-1">Students</p>
                  <p>
                    Log in with your <span className="font-medium">UP Mail</span> and your{" "}
                    <span className="font-medium">student number</span> (for example,{" "}
                    <span className="font-mono text-xs">2021-00001</span>).
                  </p>
                </div>
                <div>
                  <p className="font-medium text-slate-900 mb-1">SEB members and Validators</p>
                  <p>
                    Use the <span className="font-medium">email</span> and the password
                    issued to you by the SEB.
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs text-slate-500 mb-1">Need help?</p>
                  <p>
                    Contact the SEB at{" "}
                    <a
                      href={`mailto:${SEB_EMAIL}`}
                      className="font-medium text-red-700 hover:text-red-800 underline"
                    >
                      {SEB_EMAIL}
                    </a>
                    .
                  </p>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowHelpModal(false)}
                  className="bg-red-700 hover:bg-red-800 text-white font-semibold px-5 py-2 rounded-lg shadow-sm transition-colors cursor-pointer"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}