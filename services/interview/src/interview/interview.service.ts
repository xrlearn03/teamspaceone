import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '#prisma';
import type { AuthorizableUser } from '@teamspace-one/authorization';
import { PrismaService } from '../prisma/prisma.service.js';

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

@Injectable()
export class InterviewService {
  constructor(private readonly prisma: PrismaService) {}

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
      // Candidates never see job administration rows.
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
      // Candidate portal accounts are not linked yet; nothing to show.
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
            status: 'pending',
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
        applications: { include: { jobOpening: { select: { id: true, title: true } } } },
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
    const updated = await this.prisma.candidateApplication.update({
      where: { id: applicationId },
      data: { stage },
    });
    if (stage === 'hired' || stage === 'rejected') {
      await this.prisma.candidate.update({
        where: { id: application.candidateId },
        data: { status: stage },
      });
    }
    return updated;
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
    return this.prisma.interviewSession.create({
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
      include: { participants: true },
    });
  }

  // ---- Evaluations ----

  async listPendingEvaluations(organisationId: string, user: AuthorizableUser) {
    const sessionWhere = await this.sessionWhereForUser(organisationId, user);
    return this.prisma.interviewEvaluation.findMany({
      where: {
        organisationId,
        status: 'pending',
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
}
