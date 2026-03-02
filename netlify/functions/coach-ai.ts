import type { Handler } from "@netlify/functions";

type OpenAIResponse = any;

function pickSummary(body: any): string {
  if (!body) return "";
  // Accept multiple client payload shapes (to avoid front-end mismatch).
  // Preferred: { summary: "..." }
  // Also accept: { prompt: "..." }, { text: "..." }, { input: "..." }, { payload: {...} }
  const s =
    body.summary ??
    body.prompt ??
    body.text ??
    body.input ??
    (typeof body.payload === "string" ? body.payload : undefined);

  if (typeof s === "string" && s.trim()) return s.trim();

  // If we got an object payload, stringify a compact version as fallback.
  if (body.payload && typeof body.payload === "object") {
    try {
      return JSON.stringify(body.payload);
    } catch {
      /* ignore */
    }
  }
  // Last resort: stringify body (but cap length)
  try {
    const raw = JSON.stringify(body);
    return raw.length > 12000 ? raw.slice(0, 12000) + "…(truncated)" : raw;
  } catch {
    return "";
  }
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Method not allowed. Use POST." }),
      };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Missing OPENAI_API_KEY environment variable." }),
      };
    }

    const body = event.body ? JSON.parse(event.body) : null;
    const summary = pickSummary(body);

    if (!summary) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          error: "Missing coaching summary payload.",
          hint: "Send JSON with { summary: '...' } (preferred). This function also accepts { prompt }, { text }, or { payload }.",
        }),
      };
    }

    const system = [
      "You are Rev, a no-BS hybrid bodybuilding coach for a 60-year-old lifter (offline-first Rebuild @ 60 Tracker).",
      "Tone: practical, encouraging, slightly profane, classic old-school training mindset.",
      "Output MUST be concise, multi-line, actionable. No medical claims; suggest seeing clinician for symptoms.",
      "Use the data provided. Provide: (1) headline, (2) 3–6 bullets, (3) next-session targets (compounds + accessories + bands), (4) recovery mode suggestion if warranted.",
    ].join("\n");

    const userPrompt = [
      "Here is the latest 7–14 day training + quick log summary from the app.",
      "Analyze trends, fatigue, and give next-session targets. Keep it short and punchy.",
      "",
      summary,
    ].join("\n");

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5.2",
        input: [
          { role: "system", content: [{ type: "input_text", text: system }] },
          { role: "user", content: [{ type: "input_text", text: userPrompt }] },
        ],
        // Keep responses reasonably sized; user wants twice/day.
        max_output_tokens: 900,
      }),
    });

    const data: OpenAIResponse = await resp.json();

    if (!resp.ok) {
      return {
        statusCode: resp.status,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          error: "OpenAI request failed",
          details: data,
        }),
      };
    }

    // Extract output text (Responses API returns an array of output items).
    let text = "";
    const output = data?.output;
    if (Array.isArray(output)) {
      for (const item of output) {
        if (item?.type === "output_text" && typeof item?.text === "string") {
          text += item.text;
        } else if (item?.content && Array.isArray(item.content)) {
          for (const c of item.content) {
            if (c?.type === "output_text" && typeof c?.text === "string") text += c.text;
            if (c?.type === "summary_text" && typeof c?.text === "string" && !text) text += c.text;
          }
        }
      }
    }
    if (!text && typeof data?.output_text === "string") text = data.output_text;

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: text || "(No text returned.)",
        model: data?.model ?? "gpt-5.2",
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (err: any) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Server error", message: String(err?.message ?? err) }),
    };
  }
};


