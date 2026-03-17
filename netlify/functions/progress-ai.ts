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
      if (typeof c?.text !== "string") continue;
      if (c?.type === "output_text") {
        chunks.push(c.text);
        continue;
      }
      const t = String(c?.type ?? "");
      if (t && t.includes("text")) chunks.push(c.text);
    }
  }

  const joined = chunks.join("\n").trim();
  if (joined) return joined;
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
      "You are the Rebuild @ 60 Coach Analysis layer.",
      "You receive monthly stats, an optional deterministic scorecard snapshot, optional prior vision analysis text, and optional progress photos (first/last anchors per pose).",
      "Give a concise, practical summary in 6-12 bullet points.",
      "Be conservative: do not hallucinate numbers. Use only provided stats and what is visible in images.",
      "Treat scorecard values as structured signals, vision text as supporting observation, and photos as visual evidence.",
      "If scorecard or vision context is present, reference it when useful, but do not repeat it mechanically.",
      "Focus on waist/weight trend, training recovery environment, visible physique changes, momentum, and next-month action items.",
      "Tone: direct, calm, practical, and a bit gritty.",
    ].join("\n");

    const userText = [
      `MONTH: ${month}`,
      windowStr ? `WINDOW: ${windowStr}` : "",
      "",
      "STATS (may include nulls, and may also include scorecard / vision_context):",
      JSON.stringify(stats, null, 2),
      "",
      "Use deterministic scorecard signals when present.",
      "Use vision_context as supporting observation when present.",
      "If photos are present, compare FIRST vs LAST for each pose and note visible changes.",
      "If photos are missing, rely on stats and any included scorecard / vision context and give a plan anyway.",
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
        max_output_tokens: 600,
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
    if (!text.trim()) {
      return {
        statusCode: 502,
        body: JSON.stringify({ message: "OpenAI returned no text output.", raw: data }),
      };
    }

    return { statusCode: 200, body: JSON.stringify({ text }) };
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ message: e?.message ?? String(e) }) };
  }
};



