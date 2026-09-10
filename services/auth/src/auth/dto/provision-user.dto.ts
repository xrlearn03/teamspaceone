import { IsEmail, IsOptional, IsString, Length } from 'class-validator';

export class ProvisionUserDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  lastName?: string;
}
