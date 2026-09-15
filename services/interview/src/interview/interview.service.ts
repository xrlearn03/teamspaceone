import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '#prisma';
import { createEventEnvelope, Subjects } from '@teamspace-one/event-contracts';
import type { AuthorizableUser } from '@teamspace-one/authorization';
import type { OrganisationContextValue } from '@teamspace-one/organisation-context';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { AiClient } from './ai.client.js';
import { MeetingClient } from './meeting.client.js';

const APPLICATION_HIRED_SUBJECT = 'teamspace-one.interview.application.hired';

function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n').replace(/\r/g, '');
}

const APPLICATION_STAGES = [
  'applied',
  'screening',
  'shortlisted',
  'interview',
  'evaluation',
  'offer',
  'hired',
  'rejected',
] as const;

export interface CreateJobInput {
  title: string;
  departmentId?: string;
  departmentName?: string;
  hiringManagerId?: string;
  recruiterId?: string;
  location?: string;
  workplaceType?: string;
  employmentType?: string;
  description?: string;
  requirements?: string;
}

export interface CreateCandidateInput {
  name: string;
  email: string;
  phone?: string;
  location?: string;
  source?: string;
  jobOpeningId?: string;
}

export interface CreateSessionInput {
  candidateId: string;
  jobOpeningId?: string;
  interviewType?: string;
  scheduledAt?: string;
  durationMin?: number;
  participantIds?: string[];
}

export interface CreateEvaluationInput {
  technicalScore?: number;
  communicationScore?: number;
  problemSolvingScore?: number;
  cultureFitScore?: number;
  overallScore?: number;
  recommendation?: string;
  comments?: string;
}

export interface ScreenInput {
  resumeText?: string;
}

export interface ReviewScreeningInput {
  status?: string;
}

export interface CreateTemplateInput {
  name: string;
  jobOpeningId?: string;
  description?: string;
  config?: Record<string, unknown>;
  questions?: Array<{ category?: string; question: string }>;
}

export interface UpdateTemplateInput {
  name?: string;
  jobOpeningId?: string | null;
  description?: string;
  config?: Record<string, unknown>;
  status?: string;
  questions?: Array<{ category?: string; question: string }>;
}

export interface AiStartInput {
  templateId?: string;
  config?: Record<string, unknown>;
  interviewType?: 'ai_text' | 'ai_voice' | 'ai_video';
}

export interface AiAnswerInput {
  questionIndex: number;
  answer: string;
}

export interface ReviewEvaluationInput {
  technicalScore?: number;
  communicationScore?: number;
  problemSolvingScore?: number;
  cultureFitScore?: number;
  overallScore?: number;
  recommendation?: string;
  comments?: string;
}

export interface MakeDecisionInput {
  decision: 'offer' | 'hire' | 'reject' | 'hold';
  rationale?: string;
}

@Injectable()
export class InterviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly ai: AiClient,
    private readonly meeting: MeetingClient,
  ) {}

  /** True when the user may see all interview data for the organisation. */
  private hasOrganisationScope(user: AuthorizableUser): boolean {
    return Boolean(
      user.isSuperAdmin ||
        user.dataScopes.some(
          (s) => (s.module === 'interview' || s.module === '*') && s.scope === 'organisation',
        ),
    );
  }

  /** True when the user is restricted to their own candidate record. */
  private isOwnScope(user: AuthorizableUser): boolean {
    return user.dataScopes.some(
      (s) => (s.module === 'interview' || s.module === '*') && s.scope === 'own',
    );
  }

  private async jobWhereForUser(
    organisationId: string,
    user: AuthorizableUser,
  ): Promise<Prisma.JobOpeningWhereInput> {
    const base: Prisma.JobOpeningWhereInput = { organisationId };
    if (this.hasOrganisationScope(user)) return base;
    if (this.isOwnScope(user)) {
      return { ...base, id: '__none__' };
    }
    return {
      ...base,
      OR: [{ recruiterId: user.id }, { hiringManagerId: user.id }, { createdBy: user.id }],
    };
  }

  private async candidateWhereForUser(
    organisationId: string,
    user: AuthorizableUser,
  ): Promise<Prisma.CandidateWhereInput> {
    const base: Prisma.CandidateWhereInput = { organisationId };
    if (this.hasOrganisationScope(user)) return base;
    if (this.isOwnScope(user)) {
      return { ...base, id: '__none__' };
    }
    const [jobIds, sessionIds] = await Promise.all([
      this.prisma.jobOpening.findMany({
        where: {
          organisationId,
          OR: [{ recruiterId: user.id }, { hiringManagerId: user.id }, { createdBy: user.id }],
        },
        select: { id: true },
      }),
      this.prisma.interviewParticipant.findMany({
        where: { organisationId, userId: user.id },
        select: { sessionId: true },
      }),
    ]);
    const sessionCandidateIds = sessionIds.length
      ? (
          await this.prisma.interviewSession.findMany({
            where: { id: { in: sessionIds.map((s) => s.sessionId) }, organisationId },
            select: { candidateId: true },
          })
        ).map((s) => s.candidateId)
      : [];
    return {
      ...base,
      OR: [
        { applications: { some: { jobOpeningId: { in: jobIds.map((j) => j.id) } } } },
        { id: { in: sessionCandidateIds } },
      ],
    };
  }

  private async sessionWhereForUser(
    organisationId: string,
    user: AuthorizableUser,
  ): Promise<Prisma.InterviewSessionWhereInput> {
    const base: Prisma.InterviewSessionWhereInput = { organisationId };
    if (this.hasOrganisationScope(user)) return base;
    if (this.isOwnScope(user)) {
      return { ...base, id: '__none__' };
    }
    const jobIds = (
      await this.prisma.jobOpening.findMany({
        where: {
          organisationId,
          OR: [{ recruiterId: user.id }, { hiringManagerId: user.id }, { createdBy: user.id }],
        },
        select: { id: true },
      })
    ).map((j) => j.id);
    return {
      ...base,
      OR: [
        { createdBy: user.id },
        { participants: { some: { userId: user.id } } },
        ...(jobIds.length ? [{ jobOpeningId: { in: jobIds } }] : []),
      ],
    };
  }

  private async userJobIds(
    organisationId: string,
    user: AuthorizableUser,
  ): Promise<string[]> {
    if (this.hasOrganisationScope(user) || this.isOwnScope(user)) return [];
    const jobs = await this.prisma.jobOpening.findMany({
      where: {
        organisationId,
        OR: [{ recruiterId: user.id }, { hiringManagerId: user.id }, { createdBy: user.id }],
      },
      select: { id: true },
    });
    return jobs.map((j) => j.id);
  }

  private async applicationInScope(
    organisationId: string,
    user: AuthorizableUser,
    applicationId: string,
  ): Promise<{ application: { id: string; candidateId: string; jobOpeningId: string; stage: string } & Record<string, unknown>; job: { id: string; recruiterId: string | null; hiringManagerId: string | null; createdBy: string | null } } | null> {
    const application = await this.prisma.candidateApplication.findFirst({
      where: { id: applicationId, organisationId },
      include: { jobOpening: true },
    });
    if (!application) return null;
    const jobWhere = await this.jobWhereForUser(organisationId, user);
    const job = await this.prisma.jobOpening.findFirst({
      where: { ...jobWhere, id: application.jobOpeningId },
    });
    if (!job) return null;
    return { application: application as unknown as { id: string; candidateId: string; jobOpeningId: string; stage: string } & Record<string, unknown>, job: job as unknown as { id: string; recruiterId: string | null; hiringManagerId: string | null; createdBy: string | null } };
  }

  // ---- Dashboard overview ----

  async getOverview(organisationId: string, user: AuthorizableUser) {
    const scoped = this.hasOrganisationScope(user);
    const [jobWhere, candidateWhere, sessionWhere] = await Promise.all([
      this.jobWhereForUser(organisationId, user),
      this.candidateWhereForUser(organisationId, user),
      this.sessionWhereForUser(organisationId, user),
    ]);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const [openJobs, totalCandidates, byStage, interviewsToday, upcomingInterviews, pendingEvaluations] =
      await Promise.all([
        this.prisma.jobOpening.count({ where: { ...jobWhere, status: 'open' } }),
        this.prisma.candidate.count({ where: candidateWhere }),
        this.prisma.candidateApplication.groupBy({
          by: ['stage'],
          where: {
            organisationId,
            ...(scoped
              ? {}
              : {
                  candidate: { is: candidateWhere },
                }),
          },
          _count: { _all: true },
        }),
        this.prisma.interviewSession.count({
          where: {
            ...sessionWhere,
            scheduledAt: { gte: todayStart, lt: todayEnd },
            status: 'scheduled',
          },
        }),
        this.prisma.interviewSession.count({
          where: { ...sessionWhere, scheduledAt: { gte: todayEnd }, status: 'scheduled' },
        }),
        this.prisma.interviewEvaluation.count({
          where: {
            organisationId,
            status: { in: ['submitted', 'ai_generated'] },
            ...(scoped ? {} : { OR: [{ evaluatorId: user.id }, { session: { is: sessionWhere } }] }),
          },
        }),
      ]);

    return {
      openJobs,
      totalCandidates,
      candidatesByStage: Object.fromEntries(byStage.map((s) => [s.stage, s._count._all])),
      interviewsToday,
      upcomingInterviews,
      pendingEvaluations,
    };
  }

  // ---- Jobs ----

  async listJobs(organisationId: string, user: AuthorizableUser, status?: string) {
    const where = await this.jobWhereForUser(organisationId, user);
    return this.prisma.jobOpening.findMany({
      where: { ...where, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createJob(organisationId: string, actorId: string, dto: CreateJobInput) {
    if (!dto.title?.trim()) throw new BadRequestException('Title is required');
    return this.prisma.jobOpening.create({
      data: {
        id: randomUUID(),
        organisationId,
        title: dto.title.trim(),
        departmentId: dto.departmentId ?? null,
        departmentName: dto.departmentName ?? null,
        hiringManagerId: dto.hiringManagerId ?? null,
        recruiterId: dto.recruiterId ?? actorId,
        location: dto.location ?? null,
        workplaceType: dto.workplaceType ?? null,
        employmentType: dto.employmentType ?? null,
        description: dto.description ?? null,
        requirements: dto.requirements ?? null,
        createdBy: actorId,
      },
    });
  }

  async updateJob(organisationId: string, user: AuthorizableUser, id: string, dto: Partial<CreateJobInput> & { status?: string }) {
    const where = await this.jobWhereForUser(organisationId, user);
    const existing = await this.prisma.jobOpening.findFirst({ where: { ...where, id } });
    if (!existing) throw new NotFoundException('Job opening not found');
    return this.prisma.jobOpening.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId } : {}),
        ...(dto.departmentName !== undefined ? { departmentName: dto.departmentName } : {}),
        ...(dto.hiringManagerId !== undefined ? { hiringManagerId: dto.hiringManagerId } : {}),
        ...(dto.recruiterId !== undefined ? { recruiterId: dto.recruiterId } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.workplaceType !== undefined ? { workplaceType: dto.workplaceType } : {}),
        ...(dto.employmentType !== undefined ? { employmentType: dto.employmentType } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.requirements !== undefined ? { requirements: dto.requirements } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
  }

  // ---- Candidates ----

  async listCandidates(organisationId: string, user: AuthorizableUser, status?: string) {
    const where = await this.candidateWhereForUser(organisationId, user);
    return this.prisma.candidate.findMany({
      where: { ...where, ...(status ? { status } : {}) },
      include: {
        applications: {
          include: {
            jobOpening: { select: { id: true, title: true } },
            screeningResult: { select: { skillsFound: true, matchScore: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createCandidate(organisationId: string, dto: CreateCandidateInput) {
    const name = dto.name?.trim();
    const email = dto.email?.trim().toLowerCase();
    if (!name || !email) throw new BadRequestException('Name and email are required');

    if (dto.jobOpeningId) {
      const job = await this.prisma.jobOpening.findFirst({
        where: { id: dto.jobOpeningId, organisationId },
      });
      if (!job) throw new BadRequestException('Job opening not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const candidate = await tx.candidate.upsert({
        where: { organisationId_email: { organisationId, email } },
        update: { name, phone: dto.phone ?? undefined, location: dto.location ?? undefined, source: dto.source ?? undefined },
        create: {
          id: randomUUID(),
          organisationId,
          name,
          email,
          phone: dto.phone ?? null,
          location: dto.location ?? null,
          source: dto.source ?? null,
        },
      });

      if (dto.jobOpeningId) {
        await tx.candidateApplication.upsert({
          where: { candidateId_jobOpeningId: { candidateId: candidate.id, jobOpeningId: dto.jobOpeningId } },
          update: {},
          create: {
            id: randomUUID(),
            organisationId,
            candidateId: candidate.id,
            jobOpeningId: dto.jobOpeningId,
          },
        });
      }

      return candidate;
    });
  }

  async updateApplicationStage(
    organisationId: string,
    user: AuthorizableUser,
    applicationId: string,
    stage: string,
  ) {
    if (!(APPLICATION_STAGES as readonly string[]).includes(stage)) {
      throw new BadRequestException(`Invalid stage. Allowed: ${APPLICATION_STAGES.join(', ')}`);
    }
    const application = await this.prisma.candidateApplication.findFirst({
      where: { id: applicationId, organisationId },
      include: { jobOpening: true },
    });
    if (!application) throw new NotFoundException('Application not found');
    if (
      !this.hasOrganisationScope(user) &&
      ![application.jobOpening.recruiterId, application.jobOpening.hiringManagerId, application.jobOpening.createdBy].includes(user.id)
    ) {
      throw new NotFoundException('Application not found');
    }
    const candidate =
      stage === 'hired'
        ? await this.prisma.candidate.findUnique({ where: { id: application.candidateId } })
        : null;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.candidateApplication.update({
        where: { id: applicationId },
        data: { stage },
      });
      if (stage === 'hired' || stage === 'rejected') {
        await tx.candidate.update({
          where: { id: application.candidateId },
          data: { status: stage },
        });
      }
      if (stage === 'hired' && candidate) {
        // Cross-service wiring: HRMS consumes this event to open a pending
        // employee lifecycle record for the hired candidate.
        const envelope = createEventEnvelope({
          eventType: APPLICATION_HIRED_SUBJECT,
          organisationId,
          actorId: user.id,
          resourceType: 'candidate-application',
          resourceId: applicationId,
          payload: {
            applicationId,
            candidateId: candidate.id,
            candidateName: candidate.name,
            candidateEmail: candidate.email,
            jobOpeningId: application.jobOpeningId,
            jobTitle: application.jobOpening?.title ?? null,
            decidedBy: user.id,
          },
        });
        await this.outbox.createEvent(tx, envelope, APPLICATION_HIRED_SUBJECT);
      }
      return updated;
    });
  }

  async updateCandidate(
    organisationId: string,
    user: AuthorizableUser,
    id: string,
    dto: { resumeFileId?: string | null },
  ) {
    const where = await this.candidateWhereForUser(organisationId, user);
    const existing = await this.prisma.candidate.findFirst({
      where: { ...where, id },
    });
    if (!existing) throw new NotFoundException('Candidate not found');
    const data: Prisma.CandidateUpdateInput = {};
    if (dto.resumeFileId !== undefined) data.resumeFileId = dto.resumeFileId;
    return this.prisma.candidate.update({
      where: { id },
      data,
    });
  }

  // ---- Sessions ----

  async listSessions(organisationId: string, user: AuthorizableUser, upcomingOnly = false) {
    const where = await this.sessionWhereForUser(organisationId, user);
    return this.prisma.interviewSession.findMany({
      where: {
        ...where,
        ...(upcomingOnly ? { scheduledAt: { gte: new Date() }, status: 'scheduled' } : {}),
      },
      include: {
        candidate: { select: { id: true, name: true, email: true } },
        jobOpening: { select: { id: true, title: true } },
        participants: true,
      },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async calendarIcs(organisationId: string, id: string): Promise<{ ics: string; fileName: string }> {
    const session = await this.prisma.interviewSession.findFirst({
      where: { id, organisationId },
      include: {
        candidate: { select: { id: true, name: true, email: true } },
        jobOpening: { select: { id: true, title: true } },
        participants: { select: { userId: true } },
      },
    });
    if (!session) throw new NotFoundException('Interview session not found');
    if (!session.scheduledAt) throw new BadRequestException('Interview has no scheduled time');

    const start = session.scheduledAt;
    const end = new Date(start.getTime() + (session.durationMin ?? 60) * 60_000);
    const jobTitle = session.jobOpening?.title ?? 'Unknown role';
    const summary = `Interview: ${session.candidate?.name ?? 'Candidate'} (${jobTitle})`;
    const description = `Candidate: ${session.candidate?.name ?? ''}; Job: ${jobTitle}; Session: ${session.id}`;
    const attendeeList = session.participants.map((p) => `ATTENDEE;CN=Participant:${p.userId}`).join('\r\n');

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Teamspace One//Interview Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:interview-session-${session.id}@teamspace-one`,
      `DTSTAMP:${formatIcsDate(new Date())}`,
      `DTSTART:${formatIcsDate(start)}`,
      `DTEND:${formatIcsDate(end)}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      `ORGANIZER;CN=Teamspace One:mailto:noreply@teamspace-one.local`,
      attendeeList,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    return { ics, fileName: `interview-${session.id}.ics` };
  }

  async createSession(organisationId: string, actorId: string, dto: CreateSessionInput) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: dto.candidateId, organisationId },
    });
    if (!candidate) throw new BadRequestException('Candidate not found');
    if (dto.jobOpeningId) {
      const job = await this.prisma.jobOpening.findFirst({
        where: { id: dto.jobOpeningId, organisationId },
      });
      if (!job) throw new BadRequestException('Job opening not found');
    }

    const participantIds = [...new Set([actorId, ...(dto.participantIds ?? [])])];
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.interviewSession.create({
        data: {
          id: randomUUID(),
          organisationId,
          candidateId: dto.candidateId,
          jobOpeningId: dto.jobOpeningId ?? null,
          interviewType: dto.interviewType ?? 'video',
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          durationMin: dto.durationMin ?? 60,
          createdBy: actorId,
          participants: {
            create: participantIds.map((userId) => ({
              id: randomUUID(),
              organisationId,
              userId,
              role: userId === actorId ? 'organizer' : 'interviewer',
            })),
          },
        },
        include: {
          candidate: { select: { id: true, name: true, email: true } },
          jobOpening: { select: { id: true, title: true } },
          participants: true,
        },
      });

      const envelope = createEventEnvelope({
        eventType: Subjects.INTERVIEW_SESSION_SCHEDULED,
        organisationId,
        actorId,
        resourceType: 'interview_session',
        resourceId: session.id,
        payload: {
          sessionId: session.id,
          candidateId: candidate.id,
          candidateName: candidate.name,
          candidateEmail: candidate.email,
          jobOpeningId: dto.jobOpeningId ?? null,
          jobTitle: session.jobOpening?.title ?? null,
          scheduledAt: session.scheduledAt ? session.scheduledAt.toISOString() : null,
          durationMin: session.durationMin,
          participantIds,
          organizerId: actorId,
        },
      });
      await this.outbox.createEvent(tx, envelope, Subjects.INTERVIEW_SESSION_SCHEDULED);
      return session;
    });
  }

  // ---- Evaluations ----

  async listPendingEvaluations(organisationId: string, user: AuthorizableUser) {
    const sessionWhere = await this.sessionWhereForUser(organisationId, user);
    return this.prisma.interviewEvaluation.findMany({
      where: {
        organisationId,
        status: { in: ['submitted', 'ai_generated'] },
        ...(this.hasOrganisationScope(user)
          ? {}
          : { OR: [{ evaluatorId: user.id }, { session: { is: sessionWhere } }] }),
      },
      include: {
        session: {
          include: {
            candidate: { select: { id: true, name: true } },
            jobOpening: { select: { id: true, title: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async submitEvaluation(
    organisationId: string,
    sessionId: string,
    evaluatorId: string,
    dto: CreateEvaluationInput,
  ) {
    const session = await this.prisma.interviewSession.findFirst({
      where: { id: sessionId, organisationId },
      include: { participants: true },
    });
    if (!session) throw new NotFoundException('Interview session not found');
    if (!session.participants.some((p) => p.userId === evaluatorId)) {
      throw new NotFoundException('Interview session not found');
    }
    return this.prisma.interviewEvaluation.upsert({
      where: { sessionId_evaluatorId: { sessionId, evaluatorId } },
      update: {
        technicalScore: dto.technicalScore ?? null,
        communicationScore: dto.communicationScore ?? null,
        problemSolvingScore: dto.problemSolvingScore ?? null,
        cultureFitScore: dto.cultureFitScore ?? null,
        overallScore: dto.overallScore ?? null,
        recommendation: dto.recommendation ?? null,
        comments: dto.comments ?? null,
        status: 'submitted',
      },
      create: {
        id: randomUUID(),
        organisationId,
        sessionId,
        evaluatorId,
        technicalScore: dto.technicalScore ?? null,
        communicationScore: dto.communicationScore ?? null,
        problemSolvingScore: dto.problemSolvingScore ?? null,
        cultureFitScore: dto.cultureFitScore ?? null,
        overallScore: dto.overallScore ?? null,
        recommendation: dto.recommendation ?? null,
        comments: dto.comments ?? null,
        status: 'submitted',
      },
    });
  }

  async listSessionEvaluations(
    ctx: OrganisationContextValue,
    user: AuthorizableUser,
    sessionId: string,
  ) {
    const sessionWhere = await this.sessionWhereForUser(ctx.organisationId, user);
    const session = await this.prisma.interviewSession.findFirst({
      where: { ...sessionWhere, id: sessionId },
    });
    if (!session) throw new NotFoundException('Interview session not found');
    return this.prisma.interviewEvaluation.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async reviewEvaluation(
    ctx: OrganisationContextValue,
    user: AuthorizableUser,
    evaluationId: string,
    dto: ReviewEvaluationInput,
  ) {
    const sessionWhere = await this.sessionWhereForUser(ctx.organisationId, user);
    const evaluation = await this.prisma.interviewEvaluation.findFirst({
      where: { id: evaluationId, source: 'ai' },
      include: { session: true },
    });
    if (!evaluation || !evaluation.session) throw new NotFoundException('Evaluation not found');
    if (!this.hasOrganisationScope(user) && !await this.prisma.interviewSession.findFirst({ where: { ...sessionWhere, id: evaluation.session.id } })) {
      throw new NotFoundException('Evaluation not found');
    }

    const data: Prisma.InterviewEvaluationUpdateInput = {
      status: 'reviewed',
      reviewedBy: ctx.actorId,
      reviewedAt: new Date(),
      ...(dto.technicalScore !== undefined ? { technicalScore: dto.technicalScore } : {}),
      ...(dto.communicationScore !== undefined ? { communicationScore: dto.communicationScore } : {}),
      ...(dto.problemSolvingScore !== undefined ? { problemSolvingScore: dto.problemSolvingScore } : {}),
      ...(dto.cultureFitScore !== undefined ? { cultureFitScore: dto.cultureFitScore } : {}),
      ...(dto.overallScore !== undefined ? { overallScore: dto.overallScore } : {}),
      ...(dto.recommendation !== undefined ? { recommendation: dto.recommendation } : {}),
      ...(dto.comments !== undefined ? { comments: dto.comments } : {}),
    };
    return this.prisma.interviewEvaluation.update({
      where: { id: evaluationId },
      data,
    });
  }

  // ---- Screening ----

  async screenApplication(
    ctx: OrganisationContextValue,
    user: AuthorizableUser,
    applicationId: string,
    dto: ScreenInput,
  ) {
    const inScope = await this.applicationInScope(ctx.organisationId, user, applicationId);
    if (!inScope) throw new NotFoundException('Application not found');
    const { application } = inScope;

    const candidate = await this.prisma.candidate.findFirst({
      where: { id: application.candidateId, organisationId: ctx.organisationId },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');

    const job = await this.prisma.jobOpening.findFirst({
      where: { id: application.jobOpeningId, organisationId: ctx.organisationId },
    });
    if (!job) throw new NotFoundException('Job opening not found');

    let resumeText: string | undefined = dto.resumeText;
    if (resumeText === undefined && candidate.resumeFileId) {
      resumeText = await this.ai.fetchResumeText(ctx, candidate.resumeFileId);
    }
    if (!resumeText?.trim()) {
      throw new BadRequestException(
        'Resume text is required for AI screening — attach a resume file to the candidate or provide resume text',
      );
    }

    const result = await this.ai.screen(ctx, {
      ...(resumeText ? { resumeText } : {}),
      candidate: { name: candidate.name, email: candidate.email },
      job: {
        title: job.title,
        description: job.description ?? undefined,
        requirements: job.requirements ?? undefined,
      },
    });

    const recipientIds = [job.recruiterId, job.hiringManagerId, job.createdBy].filter(
      (id): id is string => Boolean(id),
    );

    return this.prisma.$transaction(async (tx) => {
      const screening = await tx.screeningResult.upsert({
        where: { applicationId },
        update: {
          matchScore: result.matchScore,
          skillsFound: result.skillsFound,
          missingRequirements: result.missingRequirements,
          summary: result.summary,
          confidence: result.confidence,
          model: result.model,
          promptVersion: result.promptVersion,
          status: 'ai_generated',
          reviewedBy: null,
          reviewedAt: null,
        },
        create: {
          id: randomUUID(),
          organisationId: ctx.organisationId,
          applicationId,
          matchScore: result.matchScore,
          skillsFound: result.skillsFound,
          missingRequirements: result.missingRequirements,
          summary: result.summary,
          confidence: result.confidence,
          model: result.model,
          promptVersion: result.promptVersion,
          status: 'ai_generated',
          createdBy: ctx.actorId,
        },
      });

      if (application.stage === 'applied') {
        await tx.candidateApplication.update({
          where: { id: applicationId },
          data: { stage: 'screening' },
        });
      }

      const envelope = createEventEnvelope({
        eventType: Subjects.INTERVIEW_SCREENING_COMPLETED,
        organisationId: ctx.organisationId,
        actorId: ctx.actorId,
        resourceType: 'candidate-application',
        resourceId: applicationId,
        payload: {
          applicationId,
          candidateId: candidate.id,
          candidateName: candidate.name,
          candidateEmail: candidate.email,
          jobOpeningId: application.jobOpeningId,
          jobTitle: job.title,
          matchScore: result.matchScore,
          recipientIds,
        },
      });
      await this.outbox.createEvent(tx, envelope, Subjects.INTERVIEW_SCREENING_COMPLETED);

      return screening;
    });
  }

  async getScreening(
    ctx: OrganisationContextValue,
    user: AuthorizableUser,
    applicationId: string,
  ) {
    const inScope = await this.applicationInScope(ctx.organisationId, user, applicationId);
    if (!inScope) throw new NotFoundException('Application not found');
    const application = await this.prisma.candidateApplication.findFirst({
      where: { id: applicationId, organisationId: ctx.organisationId },
      include: { screeningResult: true },
    });
    return application?.screeningResult ?? null;
  }

  async reviewScreening(
    ctx: OrganisationContextValue,
    user: AuthorizableUser,
    applicationId: string,
    dto: ReviewScreeningInput,
  ) {
    const inScope = await this.applicationInScope(ctx.organisationId, user, applicationId);
    if (!inScope) throw new NotFoundException('Application not found');
    const status = 'reviewed';
    const screening = await this.prisma.screeningResult.findFirst({
      where: { applicationId },
    });
    if (!screening) throw new NotFoundException('Screening result not found');
    return this.prisma.screeningResult.update({
      where: { id: screening.id },
      data: { status, reviewedBy: ctx.actorId, reviewedAt: new Date() },
    });
  }

  // ---- Templates ----

  private async templateScopeWhere(
    organisationId: string,
    user: AuthorizableUser,
  ): Promise<Prisma.InterviewTemplateWhereInput> {
    const base: Prisma.InterviewTemplateWhereInput = { organisationId };
    if (this.hasOrganisationScope(user) || this.isOwnScope(user)) return base;
    const jobIds = await this.userJobIds(organisationId, user);
    return {
      ...base,
      OR: [
        { createdBy: user.id },
        ...(jobIds.length ? [{ jobOpeningId: { in: jobIds } }] : []),
      ],
    };
  }

  async listTemplates(ctx: OrganisationContextValue, user: AuthorizableUser) {
    const where = await this.templateScopeWhere(ctx.organisationId, user);
    return this.prisma.interviewTemplate.findMany({
      where,
      include: { questions: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTemplate(ctx: OrganisationContextValue, dto: CreateTemplateInput) {
    if (!dto.name?.trim()) throw new BadRequestException('Template name is required');
    if (dto.jobOpeningId) {
      const job = await this.prisma.jobOpening.findFirst({
        where: { id: dto.jobOpeningId, organisationId: ctx.organisationId },
      });
      if (!job) throw new BadRequestException('Job opening not found');
    }
    const questions = dto.questions ?? [];
    return this.prisma.interviewTemplate.create({
      data: {
        id: randomUUID(),
        organisationId: ctx.organisationId,
        name: dto.name.trim(),
        jobOpeningId: dto.jobOpeningId ?? null,
        description: dto.description ?? null,
        config: (dto.config ?? {}) as unknown as Prisma.InputJsonValue,
        createdBy: ctx.actorId,
        questions: {
          create: questions.map((q, index) => ({
            id: randomUUID(),
            organisationId: ctx.organisationId,
            category: q.category ?? null,
            question: q.question,
            sortOrder: index,
          })),
        },
      },
      include: { questions: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async updateTemplate(
    ctx: OrganisationContextValue,
    user: AuthorizableUser,
    id: string,
    dto: UpdateTemplateInput,
  ) {
    const where = await this.templateScopeWhere(ctx.organisationId, user);
    const existing = await this.prisma.interviewTemplate.findFirst({
      where: { ...where, id },
      include: { questions: true },
    });
    if (!existing) throw new NotFoundException('Template not found');

    const data: Prisma.InterviewTemplateUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.config !== undefined ? { config: dto.config as unknown as Prisma.InputJsonValue } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    };
    if (dto.jobOpeningId !== undefined) {
      if (dto.jobOpeningId) {
        const job = await this.prisma.jobOpening.findFirst({
          where: { id: dto.jobOpeningId, organisationId: ctx.organisationId },
        });
        if (!job) throw new BadRequestException('Job opening not found');
        data.jobOpening = { connect: { id: dto.jobOpeningId } };
      } else {
        data.jobOpening = { disconnect: true };
      }
    }

    if (dto.questions !== undefined) {
      await this.prisma.interviewQuestion.deleteMany({ where: { templateId: id } });
      data.questions = {
        create: dto.questions.map((q, index) => ({
          id: randomUUID(),
          organisationId: ctx.organisationId,
          category: q.category ?? null,
          question: q.question,
          sortOrder: index,
        })),
      };
    }

    return this.prisma.interviewTemplate.update({
      where: { id },
      data,
      include: { questions: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async deleteTemplate(ctx: OrganisationContextValue, user: AuthorizableUser, id: string) {
    const where = await this.templateScopeWhere(ctx.organisationId, user);
    const existing = await this.prisma.interviewTemplate.findFirst({
      where: { ...where, id },
    });
    if (!existing) throw new NotFoundException('Template not found');
    return this.prisma.interviewTemplate.delete({ where: { id } });
  }

  // ---- AI interview ----

  private async sessionInScope(
    ctx: OrganisationContextValue,
    user: AuthorizableUser,
    sessionId: string,
  ): Promise<Prisma.InterviewSessionGetPayload<{ include: { candidate: true; jobOpening: true; answers: true; participants: true } }> | null> {
    const where = await this.sessionWhereForUser(ctx.organisationId, user);
    return this.prisma.interviewSession.findFirst({
      where: { ...where, id: sessionId },
      include: {
        candidate: true,
        jobOpening: true,
        answers: { orderBy: { sortOrder: 'asc' } },
        participants: true,
      },
    });
  }

  async startAiInterview(
    ctx: OrganisationContextValue,
    user: AuthorizableUser,
    sessionId: string,
    dto: AiStartInput,
  ) {
    const session = await this.sessionInScope(ctx, user, sessionId);
    if (!session) throw new NotFoundException('Interview session not found');

    const job = {
      title: session.jobOpening?.title ?? 'Unknown job',
      description: session.jobOpening?.description ?? undefined,
      requirements: session.jobOpening?.requirements ?? undefined,
    };

    let questions: Array<{ category: string; question: string }> = [];

    if (dto.templateId) {
      const template = await this.prisma.interviewTemplate.findFirst({
        where: { id: dto.templateId, organisationId: ctx.organisationId },
        include: { questions: { orderBy: { sortOrder: 'asc' } } },
      });
      if (!template) throw new NotFoundException('Template not found');
      questions = template.questions.map((q) => ({
        category: q.category ?? 'general',
        question: q.question,
      }));
      if (questions.length === 0) {
        const config = { ...(template.config as Record<string, unknown> ?? {}), ...(dto.config ?? {}) } as { count?: number; difficulty?: string; categories?: string[] };
        const generated = await this.ai.questions(ctx, { job, config });
        questions = generated.questions;
      }
    } else {
      const config = (dto.config ?? {}) as { count?: number; difficulty?: string; categories?: string[] };
      const generated = await this.ai.questions(ctx, { job, config });
      questions = generated.questions;
    }

    await this.prisma.interviewAnswer.deleteMany({ where: { sessionId } });
    await this.prisma.interviewAnswer.createMany({
      data: questions.map((q, index) => ({
        id: randomUUID(),
        organisationId: ctx.organisationId,
        sessionId,
        question: q.question,
        answer: null,
        sortOrder: index,
      })),
    });

    const updated = await this.prisma.interviewSession.update({
      where: { id: sessionId },
      data: { status: 'in_progress', interviewType: dto.interviewType ?? 'ai_text' },
      include: {
        candidate: { select: { id: true, name: true, email: true } },
        jobOpening: { select: { id: true, title: true } },
        participants: true,
        answers: { orderBy: { sortOrder: 'asc' } },
      },
    });

    return { session: updated, questions: updated.answers };
  }

  async joinAiInterview(ctx: OrganisationContextValue, sessionId: string, userId: string, displayName?: string) {
    const session = await this.prisma.interviewSession.findFirst({
      where: { id: sessionId, organisationId: ctx.organisationId },
      include: { candidate: true, jobOpening: true },
    });
    if (!session) throw new NotFoundException('Interview session not found');

    if (session.interviewType === 'ai_text') {
      throw new BadRequestException('This is a text-only AI interview; use the text transcript endpoints');
    }
    if (session.interviewType === 'ai_video') {
      throw new BadRequestException('Video AI interviews are not yet supported');
    }
    if (session.interviewType !== 'ai_voice') {
      throw new BadRequestException(`Unsupported interview type: ${session.interviewType}`);
    }

    const title = `AI Interview: ${session.candidate?.name ?? 'Candidate'} - ${session.jobOpening?.title ?? 'Interview'}`;
    await this.meeting.ensureRoom(ctx, sessionId, title);
    return this.meeting.getSfuToken(ctx, sessionId, userId, displayName);
  }

  async answerAiQuestion(
    ctx: OrganisationContextValue,
    user: AuthorizableUser,
    sessionId: string,
    dto: AiAnswerInput,
  ) {
    const session = await this.sessionInScope(ctx, user, sessionId);
    if (!session) throw new NotFoundException('Interview session not found');
    const answers = session.answers;
    const { questionIndex } = dto;
    if (
      typeof questionIndex !== 'number' ||
      !Number.isInteger(questionIndex) ||
      questionIndex < 0 ||
      questionIndex >= answers.length
    ) {
      throw new BadRequestException('Invalid question index');
    }

    await this.prisma.interviewAnswer.update({
      where: { id: answers[questionIndex].id },
      data: { answer: dto.answer },
    });

    const allAnswered = answers.every((a, i) =>
      i === questionIndex ? dto.answer.length > 0 : a.answer !== null && a.answer.length > 0,
    );
    if (allAnswered) {
      return { done: true };
    }
    const next = answers.find((a, i) => i !== questionIndex && a.answer === null);
    return { done: false, next: next ? { question: next.question, sortOrder: next.sortOrder } : null };
  }

  async getTranscript(ctx: OrganisationContextValue, user: AuthorizableUser, sessionId: string) {
    const session = await this.sessionInScope(ctx, user, sessionId);
    if (!session) throw new NotFoundException('Interview session not found');
    return session.answers;
  }

  async evaluateAiInterview(ctx: OrganisationContextValue, user: AuthorizableUser, sessionId: string) {
    const session = await this.sessionInScope(ctx, user, sessionId);
    if (!session) throw new NotFoundException('Interview session not found');

    const transcript = session.answers
      .filter((a) => a.answer !== null)
      .map((a) => ({ question: a.question, answer: a.answer as string }));

    if (transcript.length === 0) throw new BadRequestException('No answers to evaluate');

    const job = {
      title: session.jobOpening?.title ?? 'Unknown job',
      description: session.jobOpening?.description ?? undefined,
      requirements: session.jobOpening?.requirements ?? undefined,
    };

    const result = await this.ai.evaluate(ctx, { job, transcript });

    const recipientIds = (session.participants ?? [])
      .map((p) => p.userId)
      .filter((id, index, arr) => id && arr.indexOf(id) === index);

    return this.prisma.$transaction(async (tx) => {
      const evaluation = await tx.interviewEvaluation.upsert({
        where: { sessionId_evaluatorId: { sessionId, evaluatorId: 'ai' } },
        update: {
          technicalScore: result.technicalScore,
          communicationScore: result.communicationScore,
          problemSolvingScore: result.problemSolvingScore,
          cultureFitScore: result.cultureFitScore,
          overallScore: result.overallScore,
          recommendation: result.recommendation,
          comments: result.summary,
          source: 'ai',
          status: 'ai_generated',
          reviewedBy: null,
          reviewedAt: null,
          aiMetadata: {
            model: result.model,
            promptVersion: result.promptVersion,
            suggestedFollowUps: result.suggestedFollowUps,
            generatedFor: ctx.actorId,
          },
        },
        create: {
          id: randomUUID(),
          organisationId: ctx.organisationId,
          sessionId,
          evaluatorId: 'ai',
          technicalScore: result.technicalScore,
          communicationScore: result.communicationScore,
          problemSolvingScore: result.problemSolvingScore,
          cultureFitScore: result.cultureFitScore,
          overallScore: result.overallScore,
          recommendation: result.recommendation,
          comments: result.summary,
          source: 'ai',
          status: 'ai_generated',
          aiMetadata: {
            model: result.model,
            promptVersion: result.promptVersion,
            suggestedFollowUps: result.suggestedFollowUps,
            generatedFor: ctx.actorId,
          },
        },
      });

      const envelope = createEventEnvelope({
        eventType: Subjects.INTERVIEW_EVALUATION_READY,
        organisationId: ctx.organisationId,
        actorId: ctx.actorId,
        resourceType: 'interview-evaluation',
        resourceId: evaluation.id,
        payload: {
          sessionId,
          candidateId: session.candidate?.id,
          candidateName: session.candidate?.name,
          jobOpeningId: session.jobOpening?.id,
          jobTitle: session.jobOpening?.title,
          evaluationId: evaluation.id,
          overallScore: result.overallScore,
          recommendation: result.recommendation,
          recipientIds,
        },
      });
      await this.outbox.createEvent(tx, envelope, Subjects.INTERVIEW_EVALUATION_READY);

      return evaluation;
    });
  }

  // ---- Hiring decisions ----

  async makeHiringDecision(
    ctx: OrganisationContextValue,
    user: AuthorizableUser,
    applicationId: string,
    dto: MakeDecisionInput,
  ) {
    const inScope = await this.applicationInScope(ctx.organisationId, user, applicationId);
    if (!inScope) throw new NotFoundException('Application not found');

    const validDecisions = ['offer', 'hire', 'reject', 'hold'] as const;
    if (!validDecisions.includes(dto.decision)) {
      throw new BadRequestException(`Invalid decision. Allowed: ${validDecisions.join(', ')}`);
    }

    const stageMap: Record<string, string> = {
      offer: 'offer',
      hire: 'hired',
      reject: 'rejected',
    };
    const stage = stageMap[dto.decision];

    const decision = await this.prisma.hiringDecision.upsert({
      where: { applicationId },
      update: {
        decision: dto.decision,
        rationale: dto.rationale ?? null,
        decidedBy: ctx.actorId as string,
      },
      create: {
        id: randomUUID(),
        organisationId: ctx.organisationId,
        applicationId,
        decision: dto.decision,
        rationale: dto.rationale ?? null,
        decidedBy: ctx.actorId as string,
      },
      include: {
        application: {
          include: {
            candidate: { select: { id: true, name: true, email: true } },
            jobOpening: { select: { id: true, title: true } },
          },
        },
      },
    });

    if (stage) {
      await this.updateApplicationStage(ctx.organisationId, user, applicationId, stage);
    }

    return decision;
  }

  async listHiringDecisions(ctx: OrganisationContextValue, user: AuthorizableUser) {
    const scoped = this.hasOrganisationScope(user);
    const base: Prisma.HiringDecisionWhereInput = { organisationId: ctx.organisationId };
    if (!scoped) {
      const jobIds = await this.userJobIds(ctx.organisationId, user);
      if (jobIds.length) {
        base.application = { is: { jobOpeningId: { in: jobIds } } };
      } else {
        return [];
      }
    }
    return this.prisma.hiringDecision.findMany({
      where: base,
      include: {
        application: {
          include: {
            candidate: { select: { id: true, name: true } },
            jobOpening: { select: { id: true, title: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
