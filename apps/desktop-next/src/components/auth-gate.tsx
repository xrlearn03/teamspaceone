"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PermissionProvider } from "@teamspace-one/authorization/react";
import type { AuthorizableUser } from "@teamspace-one/authorization";
import { Button } from "@teamspace-one/ui/button";
import { AppShell } from "@/components/app-shell";
import { SplashScreen } from "@/components/splash/splash-screen";
import { AuthScreen } from "@/screens/auth";
import { OnboardingScreen } from "@/screens/onboarding";
import { ForcePasswordChangeDialog } from "@/components/auth/force-password-change-dialog";
import type { UserDto } from "@/lib/api";
import {
  getAccessToken,
  getMe,
  getMyContext,
  getOrganisations,
  getActiveOrganisation,
  setActiveOrganisation,
  setOnSessionCleared,
} from "@/lib/api";
import { useUIStore } from "@/stores/ui";

const MIN_SPLASH_DURATION_MS = 4000;

export function AuthGate() {
  const [session, setSession] = useState(0);
  const queryClient = useQueryClient();
  const [minSplashElapsed, setMinSplashElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinSplashElapsed(true), MIN_SPLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    setOnSessionCleared(() => {
      queryClient.clear();
      setSession((s) => s + 1);
    });
    return () => setOnSessionCleared(null);
  }, [queryClient]);

  if (!minSplashElapsed) {
    return <SplashScreen />;
  }

  return (
    <AuthGateInner
      key={session}
      onAuthenticated={() => {
        queryClient.clear();
        setSession((s) => s + 1);
      }}
    />
  );
}

function AuthGateInner({ onAuthenticated }: { onAuthenticated: () => void }) {
  const { data: token, isLoading } = useQuery({
    queryKey: ["access-token"],
    queryFn: getAccessToken,
    staleTime: Infinity,
    retry: false,
  });

  const organisationId = useUIStore((s) => s.organisationId);
  const setOrganisation = useUIStore((s) => s.setOrganisation);

  const {
    data: organisations,
    isLoading: organisationsLoading,
    isError: organisationsError,
    error: organisationsErrorDetail,
    refetch: refetchOrganisations,
  } = useQuery({
    queryKey: ["organisations"],
    queryFn: getOrganisations,
    enabled: Boolean(token),
    staleTime: 60 * 1000,
    retry: false,
  });

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    enabled: Boolean(token),
    staleTime: 60 * 1000,
    retry: false,
  });

  const forcePasswordChange = Boolean(token && me?.mustChangePassword);

  useEffect(() => {
    if (!organisations) return;
    const active = getActiveOrganisation();
    if (organisations.length === 0) {
      if (active) {
        setActiveOrganisation(null);
        setOrganisation(null);
      }
      return;
    }
    if (!active || !organisations.some((o) => o.id === active)) {
      setActiveOrganisation(organisations[0].id);
      setOrganisation(organisations[0].id);
    }
  }, [organisations, setOrganisation]);

  if (isLoading || (token && organisationsLoading)) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!token) {
    return <AuthScreen onAuthenticated={onAuthenticated} />;
  }

  if (organisationsError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <p className="text-sm font-medium text-text">Couldn&apos;t load your organisations</p>
        <p className="max-w-sm text-xs text-text-muted">
          {organisationsErrorDetail instanceof Error
            ? organisationsErrorDetail.message
            : "Check your connection and try again."}
        </p>
        <Button variant="secondary" onClick={() => refetchOrganisations()}>
          Retry
        </Button>
      </div>
    );
  }

  if (organisations && organisations.length === 0) {
    return (
      <>
        <OnboardingScreen />
        {forcePasswordChange ? <ForcePasswordChangeDialog me={me} /> : null}
      </>
    );
  }

  return (
    <>
      <PermissionBoundary
        key={organisationId ?? "none"}
        organisationId={organisationId}
        me={me}
      />
      {forcePasswordChange ? <ForcePasswordChangeDialog me={me} /> : null}
    </>
  );
}

function PermissionBoundary({
  organisationId,
  me,
}: {
  organisationId: string | null;
  me: UserDto | undefined;
}) {
  const {
    data: context,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["me-context", organisationId],
    queryFn: () => getMyContext(organisationId as string),
    enabled: Boolean(organisationId),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  if (!me) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!organisationId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <p className="text-sm font-medium text-text">No organisation selected</p>
        <p className="max-w-sm text-xs text-text-muted">
          Select or create an organisation to continue.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !context) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <p className="text-sm font-medium text-text">Couldn&apos;t load your permissions</p>
        <p className="max-w-sm text-xs text-text-muted">
          {error instanceof Error ? error.message : "Check your connection and try again."}
        </p>
        <Button variant="secondary" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const user: AuthorizableUser = {
    id: context.id,
    organisationId: context.organisationId,
    permissions: context.permissions,
    dataScopes: context.dataScopes,
    isSuperAdmin: context.isSuperAdmin,
  };

  return (
    <PermissionProvider user={user}>
      <AppShell user={me} />
    </PermissionProvider>
  );
}
