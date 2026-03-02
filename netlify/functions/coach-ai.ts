// Netlify Function: AI Coach Add-on (server-side)
// Reads OPENAI_API_KEY from Netlify environment variables.

function extractText(resp) {
  if (typeof resp?.output_text === "string") return resp.output_text;
  try {
    const out = resp?.output;
    if (Array.isArray(out)) {
      for (const item of out) {
        const content = item?.content;
        if (Array.isArray(content)) {
          for (const c of content) {
            if (c?.type === "output_text" && typeof c?.text === "string") return c.text;
            if (typeof c?.text === "string") return c.text;
          }
        }
      }
    }
  } catch {}
  return "";
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return { statusCode: 500, body: JSON.stringify({ error: "Missing OPENAI_API_KEY env var" }) };
  }

  let payload = null;
  try {
    payload = event.body ? JSON.parse(event.body) : null;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const systemPrompt = "You are \"Rev\", an old-school, no-BS strength coach for a 60-year-old lifter running a hybrid program.\nYou are advisory only (not medical). Be practical, concise, and motivating. Use bullet points and short paragraphs.\nFocus on:\n- Conservative progression for compounds; reps-first and/or small load bumps.\n- More aggressive progression for accessories (reps-first).\n- Integrate recovery cues from sleep, protein, zone2, and training fatigue.\n- Recommend Recovery Mode if appropriate (Hold Load / -5% Compounds / Cap RPE 8).\nOutput: plain text only. No markdown tables. Max ~12 bullets total.";
  const userText = `Here is the current training summary JSON. Provide coaching suggestions.\n\n${JSON.stringify(payload, null, 2)}`;

  try {
    const apiResp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5.2",
        input: [
          { role: "system", content: [{ type: "text", text: systemPrompt }] },
          { role: "user", content: [{ type: "text", text: userText }] }
        ],
        max_output_tokens: 700
      })
    });

    const respJson = await apiResp.json().catch(() => ({}));

    if (!apiResp.ok) {
      const msg = respJson?.error?.message || respJson?.message || `OpenAI error (${apiResp.status})`;
      return { statusCode: 500, body: JSON.stringify({ error: msg }) };
    }

    const text = extractText(respJson).trim();
    return {
      statusCode: 200,
      body: JSON.stringify({
        text,
        model: "gpt-5.2",
        ts: Date.now()
      })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e?.message || "Server error" }) };
  }
};
