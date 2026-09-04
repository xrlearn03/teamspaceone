import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  CurrentOrganisation,
  OrganisationContext,
  type OrganisationContextValue,
} from '@teamspace-one/organisation-context';
import { TemplateService, type CreateEntityInput } from './template.service.js';

export class CreateEntityDto {
  name!: string;
}

@Controller('template')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Post()
  async create(
    @CurrentOrganisation() organisation: OrganisationContextValue,
    @Body() dto: CreateEntityDto,
  ) {
    const result = await OrganisationContext.run(
      organisation,
      () =>
        this.templateService.createEntity({
          organisationId: organisation.organisationId,
          actorId: organisation.actorId,
          correlationId: organisation.correlationId,
          name: dto.name,
        }),
    );

    return result;
  }

  @Get()
  list(@CurrentOrganisation() organisation: OrganisationContextValue) {
    return this.templateService.listByOrganisation(organisation.organisationId);
  }
}
