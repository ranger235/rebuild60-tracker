import type { Handler } from "@netlify/functions";

type ReqBody = {
  month?: string;
  startYMD?: string;
  endYMD?: string;
  stats?: any;
  images?: { label: string; url: string }[];
};

type OpenAIResponse = any;

function extractOutputText(data: any): string {
  if (!data) return "";
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text;

  const chunks: string[] = [];
  const out = Array.isArray(data.output) ? data.output : [];
  for (const item of out) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if (c?.type === "output_text" && typeof c?.text === "string") {
        chunks.push(c.text);
        continue;
      }
      const t = String(c?.type ?? "");
      if (t && t.includes("text") && typeof c?.text === "string") chunks.push(c.text);
    }
  }
  const joined = chunks.join("\n").trim();
  if (joined) return joined;
  if (typeof data?.text === "string") return data.text;
  return "";
}

function clampScore(v: any): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, Math.round(n * 10) / 10));
}

function safeJsonFromText(text: string): any | null {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return null;
  // Try direct parse first
  try {
    return JSON.parse(trimmed);
  } catch {
    // Try to extract first JSON object
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ message: "Method not allowed" }) };
    }

    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
    if (!apiKey) {
      return { statusCode: 400, body: JSON.stringify({ message: "No OpenAI API key configured" }) };
    }

    const body: ReqBody = event.body ? JSON.parse(event.body) : {};
    const images = Array.isArray(body.images) ? body.images.slice(0, 12) : [];

    const stats = body.stats ?? {};
    const month = body.month ?? "unknown-month";
    const windowStr = body.startYMD && body.endYMD ? `${body.startYMD} to ${body.endYMD}` : "";

    const system = [
      "You are the Rebuild @ 60 ProgressLab Scoring Engine.",
      "Return a single JSON object only. No markdown, no commentary.",
      "Rate 1–10 with one decimal place.",
      "Be conservative. If you lack data, keep scores near 5.0 and explain in notes.",
      "Keys required: conditioning, muscularity, symmetry, waist_control, consistency, momentum, notes.",
      "momentum must be one of: up, down, flat.",
      "notes should be 1–3 short sentences max.",
    ].join("\n");

    const userText = [
      `MONTH: ${month}`,
      windowStr ? `WINDOW: ${windowStr}` : "",
      "",
      "STATS (may include nulls):",
      JSON.stringify(stats, null, 2),
      "",
      "If photos are present, use them as supporting evidence ONLY (avoid hallucination).",
    ]
      .filter(Boolean)
      .join("\n");

    const content: any[] = [{ type: "input_text", text: userText }];
    for (const img of images) {
      content.push({ type: "input_text", text: `IMAGE: ${img.label}` });
      content.push({ type: "input_image", image_url: img.url });
    }

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5.2-2025-12-11",
        input: [
          { role: "system", content: [{ type: "input_text", text: system }] },
          { role: "user", content },
        ],
        max_output_tokens: 400,
      }),
    });

    const data: OpenAIResponse = await resp.json();
    if (!resp.ok) {
      return {
        statusCode: resp.status,
        body: JSON.stringify({ message: data?.error?.message ?? "OpenAI error", raw: data }),
      };
    }

    const text = extractOutputText(data);
    const obj = safeJsonFromText(text);
    if (!obj) {
      return {
        statusCode: 502,
        body: JSON.stringify({ message: "Scorecard parse failed", raw_text: text, raw: data }),
      };
    }

    const scorecard = {
      conditioning: clampScore(obj.conditioning),
      muscularity: clampScore(obj.muscularity),
      symmetry: clampScore(obj.symmetry),
      waist_control: clampScore(obj.waist_control),
      consistency: clampScore(obj.consistency),
      momentum: (obj.momentum === "up" || obj.momentum === "down" || obj.momentum === "flat") ? obj.momentum : "flat",
      notes: typeof obj.notes === "string" ? obj.notes.trim().slice(0, 500) : "",
    };

    return { statusCode: 200, body: JSON.stringify({ scorecard }) };
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ message: e?.message ?? String(e) }) };
  }
};
