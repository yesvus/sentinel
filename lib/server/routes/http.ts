import { NextRequest, NextResponse } from "next/server";

export type RouteContext = { params: Promise<{ path: string[] }> };

export const MAX_BODY_BYTES = 64 * 1024;

export const noContent = () => new NextResponse(null, { status: 204 });

export const error = (message: string, status = 400) =>
  NextResponse.json({ error: message }, { status });

export function unknownFieldsError(data: Record<string, unknown>, allowedFields: readonly string[]) {
  const unknownFields = Object.keys(data).filter((field) => !allowedFields.includes(field));
  if (!unknownFields.length) return null;
  return error(`Unknown field${unknownFields.length === 1 ? "" : "s"}: ${unknownFields.join(", ")}`);
}

type RequestBody = Record<string, unknown>;

export const body = (request: NextRequest): Promise<RequestBody> =>
  request.json().catch(() => ({}));

export function clientAddress(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}
