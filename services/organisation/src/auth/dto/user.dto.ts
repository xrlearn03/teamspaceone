export interface UserDto {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  active: boolean;
  emailVerified: boolean;
  createdAt: string;
}
