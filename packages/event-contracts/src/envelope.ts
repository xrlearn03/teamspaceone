import { randomUUID } from 'node:crypto';

export interface EventEnvelope<T = unknown> {
  eventId: string;
  eventType: string;
  eventVersion: number;
  occurredAt: string;
  organisationId: string;
  workspaceId?: string;
  actorId?: string;
  resourceType: string;
  resourceId: string;
  correlationId: string;
  causationId?: string;
  payload: T;
}

export interface CreateEventEnvelopeInput<T = unknown> {
  eventType: string;
  eventVersion?: number;
  organisationId: string;
  workspaceId?: string;
  actorId?: string;
  resourceType: string;
  resourceId: string;
  correlationId?: string;
  causationId?: string;
  payload: T;
}

export function createEventEnvelope<T>(
  input: CreateEventEnvelopeInput<T>,
): EventEnvelope<T> {
  return {
    eventId: randomUUID(),
    eventType: input.eventType,
    eventVersion: input.eventVersion ?? 1,
    occurredAt: new Date().toISOString(),
    organisationId: input.organisationId,
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    correlationId: input.correlationId ?? randomUUID(),
    causationId: input.causationId,
    payload: input.payload,
  };
}

export function isEventEnvelope(value: unknown): value is EventEnvelope {
  const e = value as Partial<EventEnvelope> | undefined;
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof e.eventId === 'string' &&
    typeof e.eventType === 'string' &&
    typeof e.occurredAt === 'string' &&
    typeof e.organisationId === 'string' &&
    typeof e.resourceType === 'string' &&
    typeof e.resourceId === 'string' &&
    typeof e.correlationId === 'string'
  );
}
