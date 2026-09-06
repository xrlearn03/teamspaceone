import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { login, register, setActiveOrganisation, acceptInvitation } from "../lib/api";

export interface AuthScreenProps {
  onAuthenticated?: () => void;
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<"login" | "register" | "accept-invite">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [registered, setRegistered] = useState(false);

  const loginMutation = useMutation({
    mutationFn: (args: { email: string; password: string }) =>
      login(args.email, args.password),
    onSuccess: (data) => {
      if (data.user) setActiveOrganisation(null);
      onAuthenticated?.();
    },
    onError: (err: Error) => setError(err.message),
  });

  const registerMutation = useMutation({
    mutationFn: () => register(email, password, firstName, lastName),
    onSuccess: () => {
      setMode("login");
      setPassword("");
      setFirstName("");
      setLastName("");
      setRegistered(true);
    },
    onError: (err: Error) => setError(err.message),
  });

  const acceptInviteMutation = useMutation({
    mutationFn: async () => {
      const { user } = await register(email, password, firstName, lastName);
      const member = await acceptInvitation(token.trim());
      setActiveOrganisation(member.organisationId);
      return user;
    },
    onSuccess: () => onAuthenticated?.(),
    onError: (err: Error) => setError(err.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRegistered(false);
    if (mode === "login") {
      loginMutation.mutate({ email, password });
    } else if (mode === "register") {
      registerMutation.mutate();
    } else {
      acceptInviteMutation.mutate();
    }
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <img
        src="/teamspace-one-background-light.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover dark:hidden"
      />
      <img
        src="/teamspace-one-background-dark.jpg"
        alt=""
        className="absolute inset-0 hidden h-full w-full object-cover dark:block"
      />
      <div className="relative z-10 flex h-full items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-text">
          {mode === "login"
            ? "Sign in"
            : mode === "register"
              ? "Create account"
              : "Accept invitation"}
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          {mode === "login"
            ? "Welcome back to Teamspace One."
            : mode === "register"
              ? "Get started with your workspace."
              : "Set your password and join with your invitation token."}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === "accept-invite" && (
            <Input
              placeholder="Invitation token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
          )}
          {(mode === "register" || mode === "accept-invite") && (
            <>
              <Input
                placeholder="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
              <Input
                placeholder="Last name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </>
          )}
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-9"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted hover:text-text-secondary"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {registered && mode === "login" && (
            <p className="text-sm text-success">
              Account successfully created. Please sign in.
            </p>
          )}

          {error && (
            <p className="text-sm text-danger">{error}</p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={
              loginMutation.isPending ||
              registerMutation.isPending ||
              acceptInviteMutation.isPending
            }
          >
            {loginMutation.isPending ||
            registerMutation.isPending ||
            acceptInviteMutation.isPending
              ? "Working…"
              : mode === "login"
                ? "Sign in"
                : mode === "register"
                  ? "Create account"
                  : "Join organisation"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-text-secondary">
          {mode === "login"
            ? "No account?"
            : mode === "register"
              ? "Already have an account?"
              : "Have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(
                mode === "login"
                  ? "register"
                  : mode === "register"
                    ? "login"
                    : "login",
              );
              setError(null);
              setRegistered(false);
            }}
            className="font-medium text-primary hover:underline"
          >
            {mode === "login"
              ? "Create one"
              : mode === "register"
                ? "Sign in"
                : "Sign in"}
          </button>
        </p>
        {mode !== "accept-invite" && (
          <p className="mt-2 text-center text-sm text-text-secondary">
            Have an invitation token?{" "}
            <button
              type="button"
              onClick={() => {
                setMode("accept-invite");
                setError(null);
                setRegistered(false);
              }}
              className="font-medium text-primary hover:underline"
            >
              Accept invite
            </button>
          </p>
        )}
      </div>
    </div>
    </div>
  );
}
