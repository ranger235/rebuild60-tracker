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
  // Some wrappers provide this convenience field
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text;

  // Official Responses API shape: { output: [{ content: [{ type: 'output_text', text: '...' }, ...] }, ...] }
  const chunks: string[] = [];
  const out = Array.isArray(data.output) ? data.output : [];
  for (const item of out) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if (c?.type === "output_text" && typeof c?.text === "string") chunks.push(c.text);
      // Fallbacks seen in some variants
      if (typeof c?.text === "string" && c?.type && String(c.type).includes("text")) chunks.push(c.text);
    }
  }
  const joined = chunks.join("\n").trim();
  if (joined) return joined;

  // Last-ditch fallbacks
  if (typeof data?.text === "string") return data.text;
  if (typeof data?.output === "string") return data.output;
  return "";
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
      "You are the Rebuild @ 60 ProgressLab Physique Analyst.",
      "You receive monthly stats + optional progress photos (first/last anchors per pose).",
      "Give a concise, practical summary in 6-12 bullet points.",
      "Be conservative: do not hallucinate numbers. Use only provided stats and what is visible in images.",
      "Focus on: waist/weight trend, training recovery, posture/symmetry notes, and next-month action items.",
      "Tone: direct, supportive, a bit gritty.",
    ].join("\n");

    const userText = [
      `MONTH: ${month}`,
      windowStr ? `WINDOW: ${windowStr}` : "",
      "",
      "STATS (may include nulls):",
      JSON.stringify(stats, null, 2),
      "",
      "If photos are present, compare FIRST vs LAST for each pose and note visible changes.",
      "If photos are missing, rely on stats and give a plan anyway.",
    ]
      .filter(Boolean)
      .join("\n");

    const content: any[] = [{ type: "input_text", text: userText }];
    for (const img of images) {
      content.push({ type: "input_text", text: `IMAGE: ${img.label}` });
      // Responses API expects the direct URL string for image_url.
      content.push({ type: "input_image", image_url: img.url });
    }

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        // Keep in sync with Coach model so outputs feel consistent
        model: "gpt-5.2-2025-12-11",
        input: [
          { role: "system", content: [{ type: "input_text", text: system }] },
          { role: "user", content },
        ],
        max_output_tokens: 600,
      }),
    });

    const data: OpenAIResponse = await resp.json();
    if (!resp.ok) {
      return { statusCode: resp.status, body: JSON.stringify({ message: data?.error?.message ?? "OpenAI error", raw: data }) };
    }

    const text = extractOutputText(data);
    if (!text.trim()) {
      // Don't silently "succeed" with an empty string; it looks like the UI is broken.
      return {
        statusCode: 502,
        body: JSON.stringify({
          message: "OpenAI returned no text output.",
          raw: data,
        }),
      };
    }
    return { statusCode: 200, body: JSON.stringify({ text }) };
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ message: e?.message ?? String(e) }) };
  }
};


