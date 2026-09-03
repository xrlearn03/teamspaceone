export const Subjects = {
  USER_CREATED: 'reactify.user.created',
  USER_UPDATED: 'reactify.user.updated',
  USER_SIGNED_IN: 'reactify.user.signed_in',
  ORGANISATION_CREATED: 'reactify.organisation.created',
  ORGANISATION_MEMBER_ADDED: 'reactify.organisation.member_added',
  WORKSPACE_CREATED: 'reactify.workspace.created',
  PROJECT_CREATED: 'reactify.project.created',
  CHANNEL_CREATED: 'reactify.channel.created',
  MESSAGE_CREATED: 'reactify.message.created',
  MESSAGE_UPDATED: 'reactify.message.updated',
  MESSAGE_DELETED: 'reactify.message.deleted',
  TASK_CREATED: 'reactify.task.created',
  TASK_UPDATED: 'reactify.task.updated',
  TASK_COMPLETED: 'reactify.task.completed',
  FILE_UPLOADED: 'reactify.file.uploaded',
  MEETING_STARTED: 'reactify.meeting.started',
  MEETING_ENDED: 'reactify.meeting.ended',
  AI_SUMMARY_COMPLETED: 'reactify.ai.summary_completed',
  NOTIFICATION_CREATED: 'reactify.notification.created',
} as const;

export type Subject = (typeof Subjects)[keyof typeof Subjects];
