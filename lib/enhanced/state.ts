import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db/prisma';
import { env } from '@/lib/env';

const KEYS = {
  instanceId: 'core.instance_id',
  sessionCurrent: 'core.enhanced.session.current',
  sessionPrevious: 'core.enhanced.session.previous',
  lastHeartbeatSuccess: 'core.enhanced.heartbeat.last_success'
} as const;

async function getMetaValue(key: string): Promise<string | null> {
  const row = await prisma.systemMeta.findUnique({ where: { key } });
  return row?.value ?? null;
}

async function setMetaValue(key: string, value: string): Promise<void> {
  await prisma.systemMeta.upsert({
    where: { key },
    update: { value },
    create: { key, value }
  });
}

export async function getCoreInstanceId(): Promise<string> {
  if (env.CORE_INSTANCE_ID) return env.CORE_INSTANCE_ID;

  const existing = await getMetaValue(KEYS.instanceId);
  if (existing) return existing;

  const created = randomUUID();
  await setMetaValue(KEYS.instanceId, created);
  return created;
}

export async function getEnhancedSessionTokens(): Promise<{
  currentToken: string | null;
  previousToken: string | null;
}> {
  const [currentToken, previousToken] = await Promise.all([
    getMetaValue(KEYS.sessionCurrent),
    getMetaValue(KEYS.sessionPrevious)
  ]);
  return { currentToken, previousToken };
}

export async function setEnhancedSessionTokens(input: {
  currentToken: string;
  previousToken: string | null;
}): Promise<void> {
  await Promise.all([
    setMetaValue(KEYS.sessionCurrent, input.currentToken),
    input.previousToken === null
      ? prisma.systemMeta.delete({ where: { key: KEYS.sessionPrevious } }).catch(() => null)
      : setMetaValue(KEYS.sessionPrevious, input.previousToken)
  ]);
}

export async function setLastSuccessfulHeartbeat(at: Date): Promise<void> {
  await setMetaValue(KEYS.lastHeartbeatSuccess, at.toISOString());
}

export async function getLastSuccessfulHeartbeat(): Promise<Date | null> {
  const value = await getMetaValue(KEYS.lastHeartbeatSuccess);
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

