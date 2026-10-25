import { NextResponse, connection } from "next/server";
import { getStats, listBookings } from "@/lib/server/db";
import { serverError } from "@/lib/server/http";

export async function GET() {
  await connection();
  try {
    const [stats, recent] = await Promise.all([getStats(), listBookings({ limit: 8 })]);
    return NextResponse.json({ stats, recent });
  } catch (e) {
    return serverError(e, "loading the overview");
  }
}
