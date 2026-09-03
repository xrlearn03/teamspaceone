import { z } from 'zod';

export const AppSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  launchAtLogin: z.boolean().default(false),
  minimizeToTray: z.boolean().default(true),
  closeToTray: z.boolean().default(true),
  notificationEnabled: z.boolean().default(true),
  soundsEnabled: z.boolean().default(true),
  userId: z.string().optional(),
  workspaceId: z.string().optional(),
  lastSyncAt: z.string().datetime().optional(),
});

export type AppSettingsInput = z.input<typeof AppSettingsSchema>;
export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const OfflineQueueItemSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  payload: z.unknown(),
  retryCount: z.number().int().min(0).default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type OfflineQueueItem = z.infer<typeof OfflineQueueItemSchema>;
