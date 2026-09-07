import {
  BarChart3,
  Briefcase,
  CalendarClock,
  ClipboardCheck,
  FileSearch,
  LayoutTemplate,
  Lock,
  UserCheck,
  Users,
} from "lucide-react";
import { PermissionGate, usePermissionContext } from "@teamspace-one/authorization/react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

interface Section {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  permission: string;
  phase: string;
}

const SECTIONS: Section[] = [
  {
    title: "Job openings",
    description: "Open roles, descriptions and hiring teams",
    icon: Briefcase,
    permission: "interview.job.view",
    phase: "Phase 5",
  },
  {
    title: "Candidates",
    description: "Pipeline, resumes and applications",
    icon: Users,
    permission: "interview.candidate.view",
    phase: "Phase 5",
  },
  {
    title: "AI screening",
    description: "Resume matching and screening summaries",
    icon: FileSearch,
    permission: "interview.screening.view",
    phase: "Phase 6",
  },
  {
    title: "Interview templates",
    description: "Questions, criteria and thresholds",
    icon: LayoutTemplate,
    permission: "interview.template.view",
    phase: "Phase 5",
  },
  {
    title: "Interview sessions",
    description: "Scheduled and completed interviews",
    icon: CalendarClock,
    permission: "interview.interview.view",
    phase: "Phase 5",
  },
  {
    title: "Evaluations",
    description: "Scores, feedback and AI-assisted review",
    icon: ClipboardCheck,
    permission: "interview.interview.evaluate",
    phase: "Phase 5 / 6",
  },
  {
    title: "Hiring decisions",
    description: "Offers, approvals and audit trail",
    icon: UserCheck,
    permission: "interview.decision.view",
    phase: "Phase 5",
  },
  {
    title: "Recruitment analytics",
    description: "Pipeline conversion and time-to-hire",
    icon: BarChart3,
    permission: "interview.analytics.view",
    phase: "Phase 6",
  },
];

export function InterviewScreen() {
  const { user } = usePermissionContext();
  const isCandidate = user?.dataScopes.some(
    (s) => (s.module === "interview" || s.module === "*") && s.scope === "own",
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-6 py-4 backdrop-blur">
        <h1 className="text-xl font-semibold text-text">Interview</h1>
        <p className="text-sm text-text-secondary">
          {isCandidate
            ? "Your applications and interview schedule."
            : "AI-assisted recruiting and interview management."}
        </p>
      </header>

      <div className="grid auto-rows-min grid-cols-1 gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <PermissionGate
              key={section.title}
              permission={section.permission}
              fallback={
                <Card className="opacity-60">
                  <CardHeader className="flex-row items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-text-muted" />
                      <CardTitle className="text-sm">{section.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-text-muted">
                      You don&apos;t have access to this section.
                    </p>
                  </CardContent>
                </Card>
              }
            >
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-text-muted" />
                    <CardTitle className="text-sm">{section.title}</CardTitle>
                  </div>
                  <Badge variant="secondary">{section.phase}</Badge>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-text-secondary">{section.description}</p>
                </CardContent>
              </Card>
            </PermissionGate>
          );
        })}
      </div>
    </div>
  );
}
