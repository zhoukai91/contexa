import { env } from '@/lib/env';
import { heartbeatEnhanced } from '@/lib/enhanced/client';
import { getLastSuccessfulHeartbeat } from '@/lib/enhanced/state';
import { jsonOk, unauthorized } from '@/lib/http/response';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (env.CRON_SECRET) {
    const secret = request.headers.get('x-cron-secret');
    if (!secret || secret !== env.CRON_SECRET) {
      return unauthorized();
    }
  }

  const result = await heartbeatEnhanced();
  const lastSuccess = await getLastSuccessfulHeartbeat();

  return jsonOk({
    connected: result.connected,
    lastSuccessfulHeartbeatAt: lastSuccess?.toISOString() ?? null
  });
}

