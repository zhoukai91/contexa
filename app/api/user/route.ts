import { getUser } from '@/lib/db/queries';
import { fromUnknownError, jsonOk, unauthorized } from '@/lib/http/response';

export async function GET() {
  try {
    const user = await getUser();
    if (!user) return unauthorized();
    return jsonOk(user);
  } catch (err) {
    return fromUnknownError(err);
  }
}
