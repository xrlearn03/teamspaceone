"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AuthGate } from "@/components/auth-gate";
import {
  getAccessToken,
  getActiveOrganisation,
  getOrganisations,
  setActiveOrganisation,
} from "@/lib/api";
import { useUIStore } from "@/stores/ui";

/**
 * Platform administration console — served at webapp.teamspaceone.in/admin.
 * Forces the `platform` view and, when the signed-in user belongs to the
 * dedicated platform org, switches the active organisation to it so the
 * panel loads in the right context.
 */
export default function AdminPage() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const setOrganisation = useUIStore((s) => s.setOrganisation);

  const { data: token } = useQuery({
    queryKey: ["access-token"],
    queryFn: getAccessToken,
    staleTime: Infinity,
    retry: false,
  });

  const { data: organisations } = useQuery({
    queryKey: ["organisations"],
    queryFn: getOrganisations,
    enabled: Boolean(token),
    staleTime: 60 * 1000,
    retry: false,
  });

  useEffect(() => {
    setActiveView("platform");
  }, [setActiveView]);

  useEffect(() => {
    const platformOrg = organisations?.find((o) => o.isPlatform);
    if (platformOrg && getActiveOrganisation() !== platformOrg.id) {
      setActiveOrganisation(platformOrg.id);
      setOrganisation(platformOrg.id);
    }
  }, [organisations, setOrganisation]);

  return <AuthGate />;
}
