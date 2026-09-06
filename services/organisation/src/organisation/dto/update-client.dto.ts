import { IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsUUID()
  clientOrganisationId?: string | null;
}
