import { NextRequest } from 'next/server';
import { handleOgGet } from '../og/handler';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ogKey: string }> }
) {
  const { ogKey } = await context.params;
  return handleOgGet(request, ogKey);
}
