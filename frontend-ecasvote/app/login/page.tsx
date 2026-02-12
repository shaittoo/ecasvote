"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { login } from "@/lib/ecasvoteApi";

const API_BASE = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:4000";
const HELP_MESSAGE = "Please contact the system administrator for login assistance.";

export default function LoginPage() {
  const [upMail, setUpMail] = useState("");
  const [username, setUsername] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // Basic validation
      if (!upMail.trim() || !username.trim()) {
        setError("Please fill in all fields");
        setIsSubmitting(false);
        return;
      }

      // Validate UP Mail format
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
        }
        router.push("/studentvoter");
        return;
      } catch {
        // fall through to admin/validator
      }

      const adminResponse = await fetch(`${API_BASE}/login/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: upMail.trim(), password: username.trim() }),
      });

      if (adminResponse.ok) {
        const data = await adminResponse.json();
        if (typeof window !== "undefined") {
          localStorage.setItem("admin", JSON.stringify(data.admin || { role: "ADMIN" }));
        }
        router.push("/admin");
        return;
      }

      const validatorResponse = await fetch(`${API_BASE}/login/validator`, {
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
      }
      router.push("/validator");
    } catch (err: any) {
      // Parse error message from API
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
          {/* eCASVote Logo */}
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
          {/* Tabs removed */}
          {/* Form */}
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

              {/* Help Link */}
              <div className="flex items-center gap-1">
                <a
                  href="#"
                  className="text-sm text-slate-600 hover:text-red-600 flex items-center gap-1"
                  onClick={(e) => {
                    e.preventDefault();
                    alert(HELP_MESSAGE);
                  }}
                >
                  <span className="text-slate-500">?</span>
                  <span>How do I log in?</span>
                </a>
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
                  className="bg-red-700 hover:bg-red-800 text-white font-semibold px-8 py-3 rounded-lg shadow-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "Logging in..." : "Login"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}

