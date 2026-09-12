import App from "./App";
import { CandidateApplyPage } from "./pages/CandidateApplyPage";
import { AcceptInvitePage } from "./pages/AcceptInvitePage";
import { GuestJoinPage } from "./pages/GuestJoinPage";

export function Router() {
  const path = window.location.pathname;

  const applyMatch = /^\/apply\/([^/]+)\/([^/]+)\/?$/.exec(path);
  if (applyMatch) {
    return <CandidateApplyPage organisationId={applyMatch[1]} jobOpeningId={applyMatch[2]} />;
  }

  const joinMatch = /^\/join\/([^/]+)\/?$/.exec(path);
  if (joinMatch) {
    return <GuestJoinPage token={decodeURIComponent(joinMatch[1])} />;
  }

  if (path === "/accept-invite" || path === "/accept-invite/") {
    return <AcceptInvitePage />;
  }

  return <App />;
}
