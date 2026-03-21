import type { Handler } from "@netlify/functions";

type ReqBody = {
  pose?: string; // front | quarter | side | back
  focus?: "balanced" | "lower" | "upper";
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
    const focus = (body.focus ?? "balanced") as ReqBody["focus"];
    const labelA = body.labelA ?? "BEFORE";
    const labelB = body.labelB ?? "AFTER";

    const focusHint =
      focus === "lower"
        ? "Prioritize LOWER BODY (quads/adductors/hams/glutes/calves) while still scoring upper body."
        : focus === "upper"
          ? "Prioritize UPPER BODY (delts/chest/back/arms) while still scoring lower body."
          : "Balanced analysis across upper + lower body.";

    const system =
      "You are a professional bodybuilding physique analyst and coach. " +
      "You compare two progress photos of the SAME pose taken weeks apart. " +
      "Be conservative: only state what is clearly visible. " +
      "Never claim exact muscle gain or exact bodyfat percentage. " +
      "If framing/lighting/angle differences reduce reliability, say so and lower confidence. " +
      "You must score both LOWER and UPPER body every time (unless impossible to see).";

    const userText =
      `POSE: ${pose}\n` +
      `COMPARE: ${labelA} vs ${labelB}\n` +
      `FOCUS: ${focus}\n` +
      `${focusHint}\n\n` +
      "Assume the images are meant to be aligned/cropped similarly, but they may be casual (distance/lighting/location can differ).\n" +
      "If feet/ankles are not visible, explicitly mark CALVES as N/A (do not guess).\n\n" +
      "Return EXACTLY this structure (markdown):\n\n" +
      "## FRAME CHECK\n" +
      "- Feet/ankles visible: YES/NO\n" +
      "- Full body visible (head-to-feet): YES/NO\n" +
      "- Camera height/angle issues: <short>\n" +
      "- Distance/zoom drift: <short>\n" +
      "- Lighting drift: <short>\n" +
      "- Confidence: HIGH / MED / LOW (with 1 reason)\n\n" +
      "## LOWER BODY SCORES (0–10)\n" +
      "- Quads: X.X — <1 line>\n" +
      "- Adductors: X.X — <1 line>\n" +
      "- Hamstrings: X.X — <1 line>\n" +
      "- Glutes: X.X — <1 line>\n" +
      "- Calves: X.X or N/A — <1 line>\n" +
      "- Lower symmetry: X.X — <1 line>\n\n" +
      "## UPPER BODY SCORES (0–10)\n" +
      "- Delts: X.X — <1 line>\n" +
      "- Chest: X.X — <1 line>\n" +
      "- Back width/density: X.X — <1 line>\n" +
      "- Arms: X.X — <1 line>\n" +
      "- Upper symmetry/posture: X.X — <1 line>\n\n" +
      "## WAIST & CONDITIONING\n" +
      "- Waist control/taper: X.X — <1 line>\n" +
      "- Conditioning trend: X.X — <1 line>\n\n" +
      "## CHANGE DETECTION\n" +
      "- Improved: <bullets>\n" +
      "- Regressed: <bullets>\n" +
      "- Unchanged: <bullets>\n\n" +
      "## NEXT 7 DAYS (ACTION)\n" +
      "1) Training: <one concrete lever>\n" +
      "2) Training: <one concrete lever>\n" +
      "3) Photo: <one concrete tip to improve next comparison>\n";

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
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
        max_output_tokens: 900,
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






