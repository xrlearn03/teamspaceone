import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface DisplayNameUser {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

export function getUserDisplayName(user: DisplayNameUser | null | undefined, fallback = "Unknown") {
  if (!user) return fallback;
  const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  if (fullName) return fullName;
  const email = user.email?.trim();
  if (!email) return fallback;
  return email.split("@")[0] || fallback;
}
