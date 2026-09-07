import { IsArray, IsBoolean, IsOptional, IsString, Length } from 'class-validator';

class RoleScopeDto {
  @IsString()
  module!: string;

  @IsString()
  scope!: string;

  @IsOptional()
  @IsString()
  scopeValue?: string;
}

export class CreateRoleDto {
  @IsString()
  @Length(1, 64)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  permissionIds!: string[];

  @IsOptional()
  @IsArray()
  scopes?: RoleScopeDto[];
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionIds?: string[];

  @IsOptional()
  @IsArray()
  scopes?: RoleScopeDto[];
}
