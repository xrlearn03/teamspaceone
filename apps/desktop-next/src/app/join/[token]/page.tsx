"use client";

import { useParams } from "next/navigation";
import { GuestMeetingScreen } from "@/screens/guest-meeting";

export default function JoinPage() {
  const params = useParams<{ token: string }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  return (
    <div className="h-full">
      <GuestMeetingScreen token={decodeURIComponent(token ?? "")} />
    </div>
  );
}
