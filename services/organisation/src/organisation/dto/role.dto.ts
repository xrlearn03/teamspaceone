import { IsArray, IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';

const ROLE_CATEGORIES = ['administrative', 'managerial', 'employee', 'member', 'external', 'candidate', 'guest'] as const;

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

  @IsIn(ROLE_CATEGORIES)
  roleCategory!: string;

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
  @IsIn(ROLE_CATEGORIES)
  roleCategory?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionIds?: string[];

  @IsOptional()
  @IsArray()
  scopes?: RoleScopeDto[];
}
