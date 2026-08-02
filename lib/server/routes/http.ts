import { NextRequest, NextResponse } from "next/server";

export type RouteContext = { params: Promise<{ path: string[] }> };

export const MAX_BODY_BYTES = 64 * 1024;

export const noContent = () => new NextResponse(null, { status: 204 });

export const error = (message: string, status = 400) =>
  NextResponse.json({ error: message }, { status });

type RequestBody = Record<string, unknown>;

export const body = (request: NextRequest): Promise<RequestBody> =>
  request.json().catch(() => ({}));

export function clientAddress(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}
