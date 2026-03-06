import type { Handler } from "@netlify/functions";

type ReqBody = {
  pose?: string;
  labelA?: string;
  labelB?: string;
  imageA: string; // signed URL
  imageB: string; // signed URL
};

function extractOutputText(data: any): string {
  if (!data) return "";
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text;

  const chunks: string[] = [];
  const out = Array.isArray(data.output) ? data.output : [];
  for (const item of out) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if (c?.type === "output_text" && typeof c?.text === "string") chunks.push(c.text);
    }
  }
  return chunks.join("\n").trim();
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

    const body: ReqBody = event.body ? JSON.parse(event.body) : ({} as any);
    if (!body?.imageA || !body?.imageB) {
      return { statusCode: 400, body: JSON.stringify({ message: "Missing imageA or imageB" }) };
    }

    const pose = (body.pose ?? "pose").toUpperCase();
    const labelA = body.labelA ?? "BEFORE";
    const labelB = body.labelB ?? "AFTER";

    const system =
      "You are a professional bodybuilding physique analyst. " +
      "Compare two progress photos of the SAME pose (Front/Side/Back) taken weeks apart. " +
      "Be conservative: only state what is clearly visible. " +
      "Avoid medical claims. " +
      "Output format:\n" +
      "- 6–12 bullet points grouped by: Muscularity, Conditioning, Symmetry/Posture\n" +
      "- Then a short 'Overall read' line\n" +
      "- Then 3 action items for the next week.";

    const userText =
      `POSE: ${pose}\n` +
      `Compare ${labelA} vs ${labelB}.\n` +
      "Assume the images are aligned and cropped similarly.\n" +
      "If the photos are not physique photos, still respond with what you can and say what limits confidence.";

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        // Vision-capable model (text+image)
        model: "gpt-4.1",
        input: [
          { role: "system", content: [{ type: "input_text", text: system }] },
          {
            role: "user",
            content: [
              { type: "input_text", text: userText },
              { type: "input_text", text: `IMAGE: ${labelA}` },
              { type: "input_image", image_url: body.imageA },
              { type: "input_text", text: `IMAGE: ${labelB}` },
              { type: "input_image", image_url: body.imageB },
            ],
          },
        ],
        max_output_tokens: 700,
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return {
        statusCode: resp.status,
        body: JSON.stringify({ message: data?.error?.message ?? "OpenAI error", raw: data }),
      };
    }

    const text = extractOutputText(data);
    if (!text.trim()) {
      return { statusCode: 502, body: JSON.stringify({ message: "OpenAI returned no text output.", raw: data }) };
    }

    return { statusCode: 200, body: JSON.stringify({ text }) };
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ message: e?.message ?? String(e) }) };
  }
};

