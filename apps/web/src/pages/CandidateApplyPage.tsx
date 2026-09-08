import { useState } from "react";

const API_BASE =
  (typeof import.meta !== "undefined" &&
    ((import.meta as unknown as { env?: { VITE_API_URL?: string } }).env
      ?.VITE_API_URL)) ||
  "";

export function CandidateApplyPage({
  organisationId,
  jobOpeningId,
}: {
  organisationId: string;
  jobOpeningId: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [resume, setResume] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    try {
      const response = await fetch(`${API_BASE}/interview/public/apply`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-organisation-id": organisationId,
        },
        body: JSON.stringify({
          jobOpeningId,
          name,
          email,
          phone,
          location,
          resumeText: resume,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to submit application");
    }
  }

  if (status === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold text-slate-900">Application submitted</h1>
          <p className="mt-2 text-slate-600">Thank you for applying. We will be in touch soon.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-6">
      <form
        onSubmit={onSubmit}
        className="mx-auto max-w-xl space-y-4 rounded-2xl border border-slate-200 p-8 shadow-sm"
      >
        <h1 className="text-2xl font-semibold text-slate-900">Apply for this role</h1>
        <p className="text-sm text-slate-500">Fill in your details to apply.</p>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
        />
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone number"
          className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
        />
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Location"
          className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
        />
        <textarea
          value={resume}
          onChange={(e) => setResume(e.target.value)}
          placeholder="Paste your resume or cover letter"
          rows={5}
          className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
        />
        {status === "error" && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={status === "submitting"}
          className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {status === "submitting" ? "Submitting..." : "Submit application"}
        </button>
      </form>
    </div>
  );
}
