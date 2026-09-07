import { IsEmail, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsUUID()
  roleId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  lastName?: string;
}
