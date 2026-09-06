import { IsEmail, IsOptional, IsUUID, IsString } from 'class-validator';

export class CreateInvitationDto {
  @IsEmail()
  email!: string;

  @IsUUID()
  roleId!: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;
}
