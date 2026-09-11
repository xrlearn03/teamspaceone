import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getActiveOrganisation, setActiveOrganisation } from "@/lib/api";
import { useUIStore } from "@/stores/ui";

export function useSwitchOrganisation() {
  const queryClient = useQueryClient();
  const setOrganisation = useUIStore((s) => s.setOrganisation);

  return useCallback(
    (organisationId: string) => {
      if (organisationId === getActiveOrganisation()) return;
      queryClient.clear();
      setActiveOrganisation(organisationId);
      setOrganisation(organisationId);
    },
    [queryClient, setOrganisation],
  );
}
