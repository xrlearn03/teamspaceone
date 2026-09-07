export interface UserDto {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatarFileId: string | null;
  active: boolean;
  emailVerified: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}
