import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ operationId: string }> },
) {
  const { operationId } = await context.params;
  const body = await request.json().catch(() => null);

  if (!body?.token || !body?.payload) {
    return NextResponse.json({ detail: 'Missing token or payload' }, { status: 400 });
  }

  const response = await fetch(`${API_URL}/api/v1/publish-wizard/${operationId}/wizard-state`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${body.token}`,
    },
    body: JSON.stringify(body.payload),
  });

  if (!response.ok) {
    return NextResponse.json({ detail: 'Beacon save failed' }, { status: response.status });
  }

  const payload = await response.json();
  return NextResponse.json(payload);
}
