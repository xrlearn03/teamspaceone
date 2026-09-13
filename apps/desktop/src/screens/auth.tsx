import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@teamspace-one/ui/button";
import { Input } from "@teamspace-one/ui/input";
import { login, register, setActiveOrganisation, requestPasswordReset, resetPassword, friendlyAuthMessage } from "../lib/api";
import { toast } from "../lib/toast";

export interface AuthScreenProps {
  onAuthenticated?: () => void;
  onJoinAsGuest?: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthScreen({ onAuthenticated, onJoinAsGuest }: AuthScreenProps) {
  const [mode, setMode] = useState<"login" | "register" | "forgot-password" | "reset-password">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const loginMutation = useMutation({
    mutationFn: (args: { email: string; password: string }) =>
      login(args.email, args.password),
    onSuccess: (data) => {
      if (data.user) setActiveOrganisation(null);
      onAuthenticated?.();
    },
    onError: (err: unknown) => toast.error(friendlyAuthMessage(err)),
  });

  const registerMutation = useMutation({
    mutationFn: () => register(email, password, firstName, lastName),
    onSuccess: () => {
      setMode("login");
      setPassword("");
      setFirstName("");
      setLastName("");
      toast.success("Account successfully created. Please sign in.");
    },
    onError: (err: unknown) => toast.error(friendlyAuthMessage(err)),
  });

  const requestResetMutation = useMutation({
    mutationFn: () => requestPasswordReset(email),
    onSuccess: () => {
      setResetCode("");
      setNewPassword("");
      setConfirmPassword("");
      setMode("reset-password");
      toast.success("If that account exists, a 6-digit code has been sent to your email.");
    },
    onError: (err: unknown) => toast.error(friendlyAuthMessage(err)),
  });

  const resetMutation = useMutation({
    mutationFn: () => resetPassword(email, resetCode, newPassword),
    onSuccess: () => {
      setResetCode("");
      setNewPassword("");
      setConfirmPassword("");
      setPassword("");
      setMode("login");
      toast.success("Your password has been updated. Please sign in.");
    },
    onError: (err: unknown) => toast.error(friendlyAuthMessage(err)),
  });

  function validate(): boolean {
    if (mode === "reset-password") {
      if (resetCode.length !== 6) {
        toast.error("Enter the 6-digit code from your email");
        return false;
      }
      if (newPassword.length < 12) {
        toast.error("Password must be at least 12 characters");
        return false;
      }
      if (newPassword !== confirmPassword) {
        toast.error("New passwords do not match");
        return false;
      }
      return true;
    }
    if (!email.trim()) {
      toast.error("Email is required");
      return false;
    }
    if (!EMAIL_RE.test(email.trim())) {
      toast.error("Enter a valid email address");
      return false;
    }
    if (mode === "login" && !password) {
      toast.error("Password is required");
      return false;
    }
    if (mode === "register" && password.length < 12) {
      toast.error("Password must be at least 12 characters");
      return false;
    }
    return true;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    if (mode === "login") {
      loginMutation.mutate({ email, password });
    } else if (mode === "register") {
      registerMutation.mutate();
    } else if (mode === "forgot-password") {
      requestResetMutation.mutate();
    } else {
      resetMutation.mutate();
    }
  }

  function switchMode(next: "login" | "register" | "forgot-password" | "reset-password") {
    setMode(next);
  }

  const title =
    mode === "login"
      ? "Sign in"
      : mode === "register"
        ? "Create account"
        : mode === "forgot-password"
          ? "Forgot your password?"
          : "Set a new password";

  const description =
    mode === "login"
      ? "Welcome back to Teamspace One."
      : mode === "register"
        ? "Get started with your workspace."
        : mode === "forgot-password"
          ? "Enter your email and we'll send you a 6-digit reset code."
          : `A reset code was sent to ${email}. Enter it below to set a new password.`;

  const buttonLabel =
    mode === "login"
      ? "Sign in"
      : mode === "register"
        ? "Create account"
        : mode === "forgot-password"
          ? "Send 6-digit code"
          : "Set new password";

  const isPending =
    loginMutation.isPending ||
    registerMutation.isPending ||
    requestResetMutation.isPending ||
    resetMutation.isPending;

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <img
        src="/login-account-light-mobile-background.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover dark:hidden landscape:hidden"
      />
      <img
        src="/login-account-dark-mobile-background.png"
        alt=""
        className="absolute inset-0 hidden h-full w-full object-cover dark:block landscape:dark:hidden"
      />
      <img
        src="/teamspace-one-background-light.jpg"
        alt=""
        className="absolute inset-0 hidden h-full w-full object-cover landscape:block landscape:dark:hidden"
      />
      <img
        src="/teamspace-one-background-dark.jpg"
        alt=""
        className="absolute inset-0 hidden h-full w-full object-cover landscape:dark:block"
      />
      <div className="relative z-10 flex h-full items-center justify-center p-3 sm:p-4 lg:p-6">
        <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-text">{title}</h1>
          <p className="mt-1 text-sm text-text-muted">{description}</p>

          <form onSubmit={submit} noValidate className="mt-6 space-y-4">
            {mode === "reset-password" && (
              <Input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                placeholder="6-digit code"
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
              />
            )}
            {mode === "register" && (
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
            {mode !== "reset-password" && (
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            )}
            {(mode === "login" || mode === "register") && (
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
            )}
            {mode === "reset-password" && (
              <>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="New password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="pr-9"
                    minLength={12}
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
                <div className="relative">
                  <Input
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pr-9"
                    minLength={12}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted hover:text-text-secondary"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </>
            )}

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Working…" : buttonLabel}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-text-secondary">
            {mode === "login" ? (
              <>
                No account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("register")}
                  className="font-medium text-primary hover:underline"
                >
                  Create one
                </button>
              </>
            ) : mode === "register" ? (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="font-medium text-primary hover:underline"
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="font-medium text-primary hover:underline"
              >
                  Back to sign in
                </button>
              </>
            )}
          </p>

          {mode === "login" && (
            <p className="mt-2 text-center text-sm text-text-secondary">
              Forgot your password?{" "}
              <button
                type="button"
                onClick={() => switchMode("forgot-password")}
                className="font-medium text-primary hover:underline"
              >
                Reset it
              </button>
            </p>
          )}

          {mode === "login" && onJoinAsGuest && (
            <p className="mt-2 text-center text-sm text-text-secondary">
              Have a meeting link?{" "}
              <button
                type="button"
                onClick={onJoinAsGuest}
                className="font-medium text-primary hover:underline"
              >
                Join as guest
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
