import { Body, Controller, NotFoundException, Param, Post } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CurrentOrganisation, type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { PrismaService } from '../prisma/prisma.service.js';
import { InterviewService } from './interview.service.js';

interface PublicApplyDto {
  jobOpeningId: string;
  name: string;
  email: string;
  phone?: string;
  location?: string;
  source?: string;
  resumeText?: string;
}

interface PublicJoinDto {
  candidateId: string;
  email: string;
}

@Controller('interview/public')
export class PublicInterviewController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly interview: InterviewService,
  ) {}

  @Post('apply')
  async apply(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: PublicApplyDto,
  ) {
    const job = await this.prisma.jobOpening.findFirst({
      where: {
        id: dto.jobOpeningId,
        organisationId: ctx.organisationId,
        status: 'open',
      },
    });
    if (!job) {
      throw new NotFoundException('Job opening not found');
    }

    const email = dto.email.trim().toLowerCase();
    const name = dto.name.trim();
    const candidate = await this.prisma.candidate.upsert({
      where: {
        organisationId_email: { organisationId: ctx.organisationId, email },
      },
      update: {
        name,
        phone: dto.phone,
        location: dto.location,
      },
      create: {
        id: randomUUID(),
        organisationId: ctx.organisationId,
        name,
        email,
        phone: dto.phone,
        location: dto.location,
        source: dto.source ?? 'web',
      },
    });

    const existing = await this.prisma.candidateApplication.findFirst({
      where: { candidateId: candidate.id, jobOpeningId: dto.jobOpeningId },
    });
    if (existing) {
      return {
        candidateId: candidate.id,
        applicationId: existing.id,
        message: 'You have already applied for this position',
      };
    }

    const application = await this.prisma.candidateApplication.create({
      data: {
        id: randomUUID(),
        organisationId: ctx.organisationId,
        candidateId: candidate.id,
        jobOpeningId: dto.jobOpeningId,
        stage: 'applied',
      },
    });

    return {
      candidateId: candidate.id,
      applicationId: application.id,
      message: 'Application submitted successfully',
    };
  }

  @Post('sessions/:id/ai/join')
  async joinAiInterview(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') id: string,
    @Body() dto: PublicJoinDto,
  ) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: dto.candidateId, organisationId: ctx.organisationId },
    });
    if (!candidate || candidate.email.toLowerCase() !== dto.email.trim().toLowerCase()) {
      throw new NotFoundException('Candidate not found');
    }
    return this.interview.joinAiInterview(ctx, id, candidate.id, candidate.name);
  }
}
