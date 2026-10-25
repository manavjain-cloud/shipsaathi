import { NextResponse, connection } from "next/server";
import { dbConfigured } from "@/lib/server/db";
import { emailConfigured } from "@/lib/server/email";
import { llmInfo } from "@/lib/server/llm";

/** Which integrations are configured. Never returns secret values. */
export async function GET() {
  await connection();
  const llm = llmInfo();
  return NextResponse.json({
    database: dbConfigured(),
    gemini: llm.configured,
    geminiProvider: llm.provider ?? null,
    geminiModel: llm.model ?? null,
    email: emailConfigured(),
  });
}
