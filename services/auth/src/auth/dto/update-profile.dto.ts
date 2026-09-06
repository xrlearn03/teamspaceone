import { IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  @IsUUID()
  avatarFileId?: string | null;
}
