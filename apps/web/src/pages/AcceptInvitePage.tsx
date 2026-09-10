import { useMemo, useState } from "react";

const API_BASE =
  (typeof import.meta !== "undefined" &&
    ((import.meta as unknown as { env?: { VITE_API_URL?: string } }).env
      ?.VITE_API_URL)) ||
  "";

export function AcceptInvitePage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialToken = params.get("token") ?? "";
  const initialEmail = params.get("email") ?? "";

  const [token, setToken] = useState(initialToken);
  const [email, setEmail] = useState(initialEmail);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!token.trim() || !email.trim() || !password) {
      setError("Token, email, and password are required.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setStatus("submitting");
    try {
      const response = await fetch(`${API_BASE}/auth/redeem`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: token.trim(),
          email: email.trim().toLowerCase(),
          password,
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
        }),
      });

      if (!response.ok) throw new Error(await response.text());
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to accept invitation");
    }
  }

  if (status === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold text-slate-900">Invitation accepted</h1>
          <p className="mt-2 text-slate-600">
            Your account is ready. Open the Teamspace One desktop app to sign in.
          </p>
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
        <h1 className="text-2xl font-semibold text-slate-900">Accept your invitation</h1>
        <p className="text-sm text-slate-500">Set a password to join the organisation.</p>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-500">Invitation token</span>
          <input
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Invitation token"
            className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-500">Email</span>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-500">First name</span>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Jane"
              className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-500">Last name</span>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Doe"
              className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </label>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-500">Password</span>
          <input
            required
            type="password"
            minLength={12}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Create a secure password"
            className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-500">Confirm password</span>
          <input
            required
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your password"
            className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </label>
        {status === "error" && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={status === "submitting"}
          className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {status === "submitting" ? "Accepting..." : "Accept invitation"}
        </button>
      </form>
    </div>
  );
}
