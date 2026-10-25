import { NextResponse, connection } from "next/server";
import { recentEvents } from "@/lib/server/db";
import { serverError } from "@/lib/server/http";

export async function GET() {
  await connection();
  try {
    return NextResponse.json({ events: await recentEvents(80) });
  } catch (e) {
    return serverError(e, "loading history");
  }
}
