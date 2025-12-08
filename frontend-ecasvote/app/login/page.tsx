"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

type LoginType = "student" | "admin";

export default function LoginPage() {
  const [loginType, setLoginType] = useState<LoginType>("student");
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

      // TODO: Implement actual authentication
      // For now, just redirect to home page
      // In production, you'd call an auth API here
      console.log("Login attempt:", { loginType, upMail, username });
      
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      // Redirect based on login type
      if (loginType === "student") {
        router.push("/home");
      } else {
        router.push("/admin");
      }
    } catch (err: any) {
      setError(err.message || "Login failed. Please try again.");
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
              width={600}
              height={300}
              className="mx-auto"
              priority
            />
          </div>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="w-full md:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg">
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              type="button"
              onClick={() => {
                setLoginType("student");
                setError(null);
                setUpMail("");
                setUsername("");
              }}
              className={`flex-1 py-4 px-6 font-semibold text-sm transition-all ${
                loginType === "student"
                  ? "bg-white text-slate-900 border-b-2 border-red-700"
                  : "bg-gray-100 text-slate-600 hover:bg-gray-200"
              }`}
            >
              Student Voter
            </button>
            <button
              type="button"
              onClick={() => {
                setLoginType("admin");
                setError(null);
                setUpMail("");
                setUsername("");
              }}
              className={`flex-1 py-4 px-6 font-semibold text-sm transition-all ${
                loginType === "admin"
                  ? "bg-white text-slate-900 border-b-2 border-red-700"
                  : "bg-gray-100 text-slate-600 hover:bg-gray-200"
              }`}
            >
              Administrator
            </button>
          </div>

          {/* Form */}
          <div className="p-8">
            <h2 className="text-xl font-bold text-slate-900 mb-6">
              Login as a {loginType === "student" ? "Student Voter" : "Administrator"}
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

              {/* Username Field */}
              <div>
                <label
                  htmlFor="username"
                  className="block text-sm font-medium text-slate-700 mb-2"
                >
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="2022XXXXX"
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
                    alert("Please contact the system administrator for login assistance.");
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

