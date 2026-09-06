import { IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateClientDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsUUID()
  clientOrganisationId?: string;
}
