export const Streams = {
  USERS: 'USERS',
  ORGANISATION: 'ORGANISATION',
  MESSAGING: 'MESSAGING',
  PROJECTS: 'PROJECTS',
  FILES: 'FILES',
  MEETINGS: 'MEETINGS',
  AI: 'AI',
  NOTIFICATIONS: 'NOTIFICATIONS',
  AUDIT: 'AUDIT',
  DLQ: 'DLQ',
  TEMPLATES: 'TEMPLATES',
  HRMS: 'HRMS',
  INTERVIEW: 'INTERVIEW',
  TICKETS: 'TICKETS',
} as const;

export type StreamName = (typeof Streams)[keyof typeof Streams];

export interface StreamConfig {
  name: StreamName;
  subjects: string[];
  retention: 'limits' | 'interest' | 'work';
  maxMsgs?: number;
  maxAge?: number;
  replicas?: number;
}

export const streamConfigs: StreamConfig[] = [
  {
    name: Streams.USERS,
    subjects: ['teamspace-one.user.>'],
    retention: 'limits',
  },
  {
    name: Streams.ORGANISATION,
    subjects: [
      'teamspace-one.organisation.>',
      'teamspace-one.workspace.>',
      'teamspace-one.guest.>',
      'teamspace-one.client.>',
    ],
    retention: 'limits',
  },
  {
    name: Streams.MESSAGING,
    subjects: ['teamspace-one.channel.>', 'teamspace-one.message.>', 'teamspace-one.conversation.>'],
    retention: 'limits',
  },
  {
    name: Streams.PROJECTS,
    subjects: [
      'teamspace-one.project.>',
      'teamspace-one.task.>',
      'teamspace-one.client_project.>',
      'teamspace-one.approval.>',
    ],
    retention: 'limits',
  },
  {
    name: Streams.FILES,
    subjects: ['teamspace-one.file.>'],
    retention: 'limits',
  },
  {
    name: Streams.MEETINGS,
    subjects: ['teamspace-one.meeting.>', 'teamspace-one.voice.>'],
    retention: 'limits',
  },
  {
    name: Streams.AI,
    subjects: ['teamspace-one.ai.>'],
    retention: 'limits',
  },
  {
    name: Streams.NOTIFICATIONS,
    subjects: ['teamspace-one.notification.>'],
    retention: 'limits',
  },
  {
    name: Streams.AUDIT,
    subjects: ['teamspace-one.audit.>'],
    retention: 'limits',
  },
  {
    name: Streams.DLQ,
    subjects: ['teamspace-one.dlq.>'],
    retention: 'limits',
  },
  {
    name: Streams.TEMPLATES,
    subjects: ['teamspace-one.template.>'],
    retention: 'limits',
  },
  {
    name: Streams.HRMS,
    subjects: ['teamspace-one.hrms.>'],
    retention: 'limits',
  },
  {
    name: Streams.INTERVIEW,
    subjects: ['teamspace-one.interview.>'],
    retention: 'limits',
  },
  {
    name: Streams.TICKETS,
    subjects: ['teamspace-one.ticket.>'],
    retention: 'limits',
  },
];
