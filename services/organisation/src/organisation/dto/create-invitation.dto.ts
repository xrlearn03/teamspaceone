import { IsEmail, IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class CreateInvitationDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  roleId!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  clientId?: string;
}
