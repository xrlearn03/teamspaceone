export interface QueuedMessage {
  id: string;
  type: "message";
  payload: { channelId: string; content: string; attachmentIds?: string[]; parentMessageId?: string };
  organisationId: string;
  createdAt: string;
}

export async function queuedMessageCount(): Promise<number> {
  return 0;
}

export async function flushQueue(): Promise<void> {}

export async function enqueueMessage(
  payload: QueuedMessage["payload"],
): Promise<QueuedMessage> {
  return {
    id: crypto.randomUUID?.() ?? `${Date.now()}`,
    type: "message",
    payload,
    organisationId: "none",
    createdAt: new Date().toISOString(),
  };
}

export async function listQueuedMessages(): Promise<QueuedMessage[]> {
  return [];
}

export async function removeQueuedMessage(_id: string): Promise<void> {}
