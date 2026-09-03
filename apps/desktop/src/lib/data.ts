export const currentUser = {
  id: "u-1",
  name: "Alex Chen",
  email: "alex@reactify.io",
  status: "online" as const,
  avatar: "",
};

export const currentWorkspace = {
  id: "ws-1",
  name: "Acme Agency",
  role: "owner" as const,
  avatar: "",
};

export const organisations = [
  { id: "org-1", name: "Acme Agency", role: "owner" as const, unread: 2 },
  { id: "org-2", name: "ClientCo", role: "member" as const, unread: 0 },
];

export const channels = [
  { id: "ch-1", name: "general", type: "public" as const, unread: 0, mentions: 0 },
  { id: "ch-2", name: "design", type: "public" as const, unread: 3, mentions: 1 },
  { id: "ch-3", name: "engineering", type: "public" as const, unread: 12, mentions: 0 },
  { id: "ch-4", name: "client-feedback", type: "private" as const, unread: 0, mentions: 0 },
];

export const directMessages = [
  { id: "dm-1", name: "Sarah Miller", status: "online" as const, unread: 2, avatar: "" },
  { id: "dm-2", name: "James Wilson", status: "away" as const, unread: 0, avatar: "" },
  { id: "dm-3", name: "Emily Rodriguez", status: "offline" as const, unread: 0, avatar: "" },
];

export const projects = [
  { id: "p-1", name: "Q3 Brand Refresh", status: "In Progress", progress: 0.62, unread: 1 },
  { id: "p-2", name: "Website Redesign", status: "In Review", progress: 0.85, unread: 0 },
  { id: "p-3", name: "Mobile App", status: "Blocked", progress: 0.34, unread: 0 },
];

export const meetings = [
  { id: "m-1", title: "Design Sync", time: "09:00", status: "upcoming" as const },
  { id: "m-2", title: "Engineering Standup", time: "10:30", status: "live" as const },
  { id: "m-3", title: "Client Review", time: "14:00", status: "upcoming" as const },
];

export const voiceRooms = [
  { id: "v-1", name: "Focus Room", participants: 4 },
  { id: "v-2", name: "Watercooler", participants: 0 },
];

export const tasks = [
  { id: "t-1", title: "Update brand guidelines", status: "In Progress", priority: "high", assignee: "Sarah", due: "Today" },
  { id: "t-2", title: "Review homepage wireframes", status: "Todo", priority: "medium", assignee: "You", due: "Tomorrow" },
  { id: "t-3", title: "Fix navigation bug", status: "Done", priority: "low", assignee: "James", due: "Yesterday" },
  { id: "t-4", title: "Prepare client assets", status: "Blocked", priority: "high", assignee: "Emily", due: "Sep 4" },
];

export const notifications = [
  { id: "n-1", type: "mention", actor: "Sarah Miller", title: "mentioned you in #design", body: "Can you review the color palette?", time: "2m", read: false },
  { id: "n-2", type: "task", actor: "System", title: "Task assigned to you", body: "Update brand guidelines is due today", time: "1h", read: false },
  { id: "n-3", type: "meeting", actor: "James Wilson", title: "Meeting starting soon", body: "Engineering Standup at 10:30", time: "2h", read: true },
  { id: "n-4", type: "approval", actor: "ClientCo", title: "Approval requested", body: "Website homepage v3", time: "5h", read: true },
];

export const messages = [
  { id: "msg-1", author: "Sarah Miller", avatar: "", content: "Morning team, the new brand palette is ready for review.", time: "09:14", reactions: [{ emoji: "👍", count: 3 }], replies: 2 },
  { id: "msg-2", author: "James Wilson", avatar: "", content: "Great work. I'll take a look after standup.", time: "09:16", reactions: [], replies: 0 },
  { id: "msg-3", author: "Emily Rodriguez", avatar: "", content: "Can we schedule a client review for Thursday?", time: "09:20", reactions: [{ emoji: "✅", count: 1 }], replies: 5 },
];

export const searchFilters = ["Messages", "Channels", "Files", "Projects", "Tasks", "Meetings", "People"];

export const recentSearches = ["brand refresh", "homepage wireframes", "@sarah"];
