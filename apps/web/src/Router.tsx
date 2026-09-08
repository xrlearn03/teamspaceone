import App from "./App";
import { CandidateApplyPage } from "./pages/CandidateApplyPage";

export function Router() {
  const path = window.location.pathname;
  const match = /^\/apply\/([^/]+)\/([^/]+)\/?$/.exec(path);
  if (match) {
    return <CandidateApplyPage organisationId={match[1]} jobOpeningId={match[2]} />;
  }
  return <App />;
}
