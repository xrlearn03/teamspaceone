import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getActiveOrganisation, setActiveOrganisation } from "../lib/api";
import { useUIStore } from "../stores/ui";

/**
 * Switch the active organisation safely:
 * - clears the entire React Query cache so no cached data from the
 *   previous organisation can be displayed
 * - updates the reactive organisation id, which remounts the app shell
 *   (keyed on the organisation id) so all screens refetch under the new
 *   organisation and the realtime socket reconnects and joins only the
 *   new organisation's authorized rooms
 * - resets org-scoped UI state (active channel/project/meeting, panels)
 */
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
