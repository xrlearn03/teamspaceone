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
  TEMPLATES: 'TEMPLATES',
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
    subjects: ['reactify.user.>'],
    retention: 'limits',
  },
  {
    name: Streams.ORGANISATION,
    subjects: ['reactify.organisation.>', 'reactify.workspace.>'],
    retention: 'limits',
  },
  {
    name: Streams.MESSAGING,
    subjects: ['reactify.channel.>', 'reactify.message.>', 'reactify.conversation.>'],
    retention: 'limits',
  },
  {
    name: Streams.PROJECTS,
    subjects: ['reactify.project.>', 'reactify.task.>'],
    retention: 'limits',
  },
  {
    name: Streams.FILES,
    subjects: ['reactify.file.>'],
    retention: 'limits',
  },
  {
    name: Streams.MEETINGS,
    subjects: ['reactify.meeting.>'],
    retention: 'limits',
  },
  {
    name: Streams.AI,
    subjects: ['reactify.ai.>'],
    retention: 'limits',
  },
  {
    name: Streams.NOTIFICATIONS,
    subjects: ['reactify.notification.>'],
    retention: 'limits',
  },
  {
    name: Streams.AUDIT,
    subjects: ['reactify.audit.>', 'reactify.>'],
    retention: 'limits',
  },
  {
    name: Streams.TEMPLATES,
    subjects: ['reactify.template.>'],
    retention: 'limits',
  },
];
