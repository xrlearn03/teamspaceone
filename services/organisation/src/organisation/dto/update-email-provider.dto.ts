import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateEmailProviderDto {
  @IsString()
  host!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  @Type(() => Number)
  port!: number;

  @IsBoolean()
  @Type(() => Boolean)
  secure!: boolean;

  @IsString()
  @IsOptional()
  user?: string;

  @IsString()
  @IsOptional()
  pass?: string;

  @IsString()
  @IsOptional()
  from?: string;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  enabled?: boolean;
}
