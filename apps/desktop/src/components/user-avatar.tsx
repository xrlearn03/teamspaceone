import { useEffect, useState } from "react";
import { downloadFile, type UserDto } from "../lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { cn } from "../lib/utils";

export function useFileObjectUrl(fileId?: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!fileId) {
      setUrl(null);
      return;
    }
    let revoked = false;
    let objectUrl: string | null = null;
    downloadFile(fileId)
      .then((blob) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(null));
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId]);
  return url;
}

interface UserAvatarProps {
  user?: Pick<UserDto, "firstName" | "lastName" | "email" | "avatarFileId"> | null;
  className?: string;
  fallbackClassName?: string;
}

export function UserAvatar({ user, className, fallbackClassName }: UserAvatarProps) {
  const imageUrl = useFileObjectUrl(user?.avatarFileId);
  const name =
    `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || user?.email || "User";
  return (
    <Avatar className={className}>
      {imageUrl ? <AvatarImage src={imageUrl} alt={name} /> : null}
      <AvatarFallback className={cn(fallbackClassName)}>
        {name.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
