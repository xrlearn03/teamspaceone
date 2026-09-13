import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@teamspace-one/ui/dialog";
import { Button } from "@teamspace-one/ui/button";
import { Input } from "@teamspace-one/ui/input";
import { changePassword, friendlyAuthMessage, login, type UserDto } from "../../lib/api";
import { toast } from "../../lib/toast";

interface ForcePasswordChangeDialogProps {
  me: UserDto | undefined;
}

/**
 * Non-dismissable dialog shown when the signed-in user was provisioned with a
 * temporary password (mustChangePassword). Blocks the app until a new
 * password is set.
 */
export function ForcePasswordChangeDialog({ me }: ForcePasswordChangeDialogProps) {
  if (!me) return null;
  const user = me;
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPassword) {
      toast.error("Enter the temporary password from your invite email");
      return;
    }
    if (newPassword.length < 12) {
      toast.error("New password must be at least 12 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    if (newPassword === currentPassword) {
      toast.error("New password must differ from the temporary password");
      return;
    }
    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      const result = await login(user.email, newPassword);
      queryClient.setQueryData(["me"], result.user);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      toast.error(
        /current password is incorrect/i.test(raw)
          ? "The temporary password you entered is incorrect — check your invite email and try again."
          : friendlyAuthMessage(err, "Failed to update password"),
      );
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
            Your account was created with a temporary password — find it in your invite email, then choose a new password to continue.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="mt-2 flex flex-col gap-3">
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

          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save password"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
