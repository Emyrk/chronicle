import { NextRequest } from 'next/server';
import { handleOgGet } from './handler';

export async function GET(request: NextRequest) {
  return handleOgGet(request, 'og');
}
