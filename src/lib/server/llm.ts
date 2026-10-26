import "server-only";

/**
 * Gemini client over the OpenAI-compatible chat endpoint.
 *  - GEMINI_API_KEY (Google AI Studio)  → generativelanguage.googleapis.com
 *  - OPENROUTER_API_KEY                 → openrouter.ai (model google/gemini-*)
 * Keys never leave the server and are never logged.
 */

type Provider = { name: "google" | "openrouter"; url: string; key: string; model: string };

function provider(): Provider | null {
  if (process.env.GEMINI_API_KEY) {
    return {
      name: "google",
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      key: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    };
  }
  if (process.env.OPENROUTER_API_KEY) {
    return {
      name: "openrouter",
      url: "https://openrouter.ai/api/v1/chat/completions",
      key: process.env.OPENROUTER_API_KEY,
      model: process.env.GEMINI_MODEL || "google/gemini-3.5-flash",
    };
  }
  return null;
}

export function llmConfigured(): boolean {
  return provider() !== null;
}

export function llmInfo(): { configured: boolean; provider?: string; model?: string } {
  const p = provider();
  return p ? { configured: true, provider: p.name, model: p.model } : { configured: false };
}

export class LlmError extends Error {}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function completeJSON<T>(
  messages: ChatMessage[],
  schema: { name: string; schema: Record<string, unknown> },
  opts: { temperature?: number; timeoutMs?: number } = {},
): Promise<T> {
  const p = provider();
  if (!p) throw new LlmError("Gemini is not configured.");

  const body: Record<string, unknown> = {
    model: p.model,
    messages,
    temperature: opts.temperature ?? 0.1,
    response_format: { type: "json_schema", json_schema: { name: schema.name, strict: true, schema: schema.schema } },
  };
  if (p.name === "openrouter") body.provider = { require_parameters: true };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 25000);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` };
    if (p.name === "openrouter") {
      headers["HTTP-Referer"] = "https://saathifly.vercel.app";
      headers["X-Title"] = "SaathiFly";
    }
    const res = await fetch(p.url, { method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal });
    if (!res.ok) {
      // Don't echo provider bodies (they can include request details); status is enough.
      throw new LlmError(`Gemini request failed (HTTP ${res.status}).`);
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new LlmError("Gemini returned an empty response.");
    return parseJsonLoose<T>(content);
  } catch (e) {
    if (e instanceof LlmError) throw e;
    if ((e as Error).name === "AbortError") throw new LlmError("Gemini took too long to respond.");
    throw new LlmError("Could not reach Gemini.");
  } finally {
    clearTimeout(timer);
  }
}

function parseJsonLoose<T>(s: string): T {
  const trimmed = s.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1)) as T;
    throw new LlmError("Gemini returned something that isn't JSON.");
  }
}
