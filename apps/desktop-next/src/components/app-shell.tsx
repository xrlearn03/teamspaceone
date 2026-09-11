"use client";

import { Button } from "@teamspace-one/ui";
import { Hexagon, LogOut } from "lucide-react";
import { logout } from "@/lib/api";
import type { UserDto } from "@/lib/api";

export function AppShell({ user }: { user: UserDto }) {
  const handleLogout = async () => {
    await logout();
    window.location.reload();
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="h-9 w-9 p-0" aria-label="Teamspace One logo">
            <Hexagon className="h-6 w-6 text-primary" />
          </Button>
          <h1 className="text-lg font-semibold text-text">Teamspace One</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-text-secondary">{user.email}</span>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </Button>
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-text-secondary">
          Desktop web app shell — route integration in progress
        </p>
        <p className="max-w-md text-sm text-text-muted">
          The shared UI package and web-safe API client are wired. Next step is to migrate the
          desktop screens into Next.js routes.
        </p>
      </main>
    </div>
  );
}
