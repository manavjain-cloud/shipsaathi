import "server-only";
import { NextResponse } from "next/server";
import { DbUnavailableError } from "./db";

/** Best-effort per-instance limiter. Serverless instances don't share memory, so this only slows abuse down. */
const buckets = new Map<string, number[]>();

export function rateLimit(req: Request, name: string, max: number, windowMs: number): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  const key = `${name}:${ip}`;
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) buckets.clear();
  return true;
}

export function jsonError(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function tooMany() {
  return jsonError("Too many requests — please wait a minute and try again.", 429);
}

/** Maps unexpected errors to a safe message (no stack traces, connection strings or provider bodies). */
export function serverError(e: unknown, what: string) {
  if (e instanceof DbUnavailableError) return jsonError("The database isn't configured on this deployment.", 503);
  console.error(`[${what}]`, e instanceof Error ? e.message.replace(/postgres(ql)?:\/\/\S+/gi, "[db-url]") : "unknown error");
  return jsonError(`Something went wrong while ${what}. Please try again.`, 500);
}

export async function readJson(req: Request, maxBytes = 1_000_000): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new RequestTooLarge();
  try {
    return JSON.parse(text);
  } catch {
    throw new BadJson();
  }
}

export class RequestTooLarge extends Error {}
export class BadJson extends Error {}
