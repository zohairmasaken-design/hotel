export const runtime = 'edge';

export async function POST() {
  return new Response('AI assistant has been disabled.', { status: 410 });
}
