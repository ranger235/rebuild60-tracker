import type { Handler } from "@netlify/functions";

/**
 * Netlify Function: /.netlify/functions/coach-ai
 *
 * Calls OpenAI Responses API server-side (API key stays in Netlify env vars).
 * Expects POST JSON: { userId?: string, weekStart?: string, summary: string }
 * Returns: { text: string, model: string, timestamp: string }
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function jsonResponse(statusCode: number, body: any) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "POST,OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

function extractOutputText(resp: any): string {
  // Responses API returns an "output" array with message items containing content blocks.
  const out = resp?.output;
  if (!Array.isArray(out)) return "";

  const chunks: string[] = [];

  for (const item of out) {
    if (item?.type === "message" && item?.role === "assistant" && Array.isArray(item?.content)) {
      for (const c of item.content) {
        if (c?.type === "output_text" && typeof c?.text === "string") chunks.push(c.text);
        if (c?.type === "summary_text" && typeof c?.text === "string") chunks.push(c.text);
      }
    }
  }

  // Some SDKs also provide a convenience field.
  if (chunks.length === 0 && typeof resp?.output_text === "string") return resp.output_text;

  return chunks.join("\n").trim();
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method not allowed. Use POST." });

  if (!OPENAI_API_KEY) {
    return jsonResponse(500, { error: "Missing OPENAI_API_KEY in Netlify environment variables." });
  }

  let payload: any = null;
  try {
    payload = event.body ? JSON.parse(event.body) : null;
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body." });
  }

  const summary = String(payload?.summary ?? "").trim();
  if (!summary) return jsonResponse(400, { error: "Missing 'summary' in request body." });

  const model = "gpt-5.2";
  const timestamp = new Date().toISOString();

  // IMPORTANT: In Responses API, message content blocks must be typed as "input_text" (not "text").
  const input = [
    {
      role: "developer",
      content: [
        {
          type: "input_text",
          text:
            "You are a no-nonsense strength coach for a 60-year-old lifter running a hybrid program: conservative progression on compounds, aggressive reps-first on accessories, band resist/assist supported, and recovery-aware (sleep/protein/zone2). " +
            "Give concise, practical suggestions. Use bullet points. Avoid medical claims. If fatigue is flagged, propose a recovery mode (hold, -5%, or cap RPE 8).",
        },
      ],
    },
    {
      role: "user",
      content: [{ type: "input_text", text: summary }],
    },
  ];

  const reqBody: any = {
    model,
    input,
    // Keep it tight; the UI can call again later.
    max_output_tokens: 600,
  };

  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(reqBody),
    });

    const data = await r.json();

    if (!r.ok) {
      return jsonResponse(r.status, {
        error: data?.error?.message ?? "OpenAI API error",
        details: data?.error ?? data,
      });
    }

    const text = extractOutputText(data) || "(No text returned.)";

    return jsonResponse(200, { text, model, timestamp });
  } catch (err: any) {
    return jsonResponse(500, { error: "Server error calling OpenAI.", details: String(err?.message ?? err) });
  }
};

