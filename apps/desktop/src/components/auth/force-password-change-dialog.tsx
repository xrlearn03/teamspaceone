import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { changePassword } from "../../lib/api";

/**
 * Non-dismissable dialog shown when the signed-in user was provisioned with a
 * temporary password (mustChangePassword). Blocks the app until a new
 * password is set.
 */
export function ForcePasswordChangeDialog() {
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 12) {
      setError("New password must be at least 12 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password must differ from the temporary password");
      return;
    }
    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open>
      <DialogContent
        className="w-full max-w-sm p-6"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="p-0 pb-2">
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-primary-subtle">
            <KeyRound className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle>Set a new password</DialogTitle>
          <DialogDescription>
            Your account was created with a temporary password. Choose a new password to continue.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="mt-2 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">Temporary password</span>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <label className="relative flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">New password</span>
            <Input
              type={showPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pr-9"
              autoComplete="new-password"
              minLength={12}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute bottom-2 right-2 rounded p-1 text-text-muted hover:text-text-secondary"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </label>
          <label className="relative flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">Confirm new password</span>
            <Input
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pr-9"
              autoComplete="new-password"
              minLength={12}
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((v) => !v)}
              aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
              className="absolute bottom-2 right-2 rounded p-1 text-text-muted hover:text-text-secondary"
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </label>

          {error ? <p className="text-sm text-error">{error}</p> : null}

          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save password"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
