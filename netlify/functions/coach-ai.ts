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


function buildPrompt(body: any): string {
  if (!body || typeof body !== "object") return "";

  // If the app sent the structured payload, format it explicitly so the model reliably uses it.
  const hasStructured = body.coach_core || body.quick_log_today || body.week;
  if (!hasStructured) return "";

  const week = body.week ?? {};
  const qc = body.quick_log_today ?? {};
  const qRecent = Array.isArray(body.quick_log_recent) ? body.quick_log_recent : [];
  const recentWorkouts = Array.isArray(body.recent_workouts) ? body.recent_workouts : [];
  const core = body.coach_core ?? body;

  const safeJson = (v: any) => {
    try {
      const s = JSON.stringify(v, null, 2);
      return s.length > 12000 ? s.slice(0, 12000) + "\n…(truncated)" : s;
    } catch {
      return String(v);
    }
  };

  return [
    "STRUCTURED APP PAYLOAD (use this — do not ignore):",
    "",
    `Week: ${week.start ?? "?"} → ${week.end ?? "?"}`,
    "",
    "Quick Log (selected day):",
    `- day_date: ${qc.day_date ?? "?"}`,
    `- weight_lbs: ${qc.weight_lbs ?? "null"}`,
    `- waist_in: ${qc.waist_in ?? "null"}`,
    `- sleep_hours: ${qc.sleep_hours ?? "null"}`,
    `- calories: ${qc.calories ?? "null"}`,
    `- protein_g: ${qc.protein_g ?? "null"}`,
    `- zone2_minutes: ${qc.zone2_minutes ?? "null"}`,
    qc.notes ? `- notes: ${qc.notes}` : "- notes: (none)",
    "",
    "Quick Log (recent window, oldest→newest):",
    qRecent.length
      ? qRecent
          .map((d: any) => {
            const w = d?.weight_lbs ?? "null";
            const wa = d?.waist_in ?? "null";
            const sl = d?.sleep_hours ?? "null";
            const c = d?.calories ?? "null";
            const p = d?.protein_g ?? "null";
            const z = d?.zone2_minutes ?? "null";
            return `- ${d?.day_date ?? "?"}: wt ${w}, waist ${wa}, sleep ${sl}, cal ${c}, pro ${p}, z2 ${z}`;
          })
          .join("\n")
      : "- (no recent quick log data)",
    "",
    "Recent workouts (most recent first; compact; best set per exercise):",
    recentWorkouts.length
      ? recentWorkouts
          .map((s: any) => {
            const ex = Array.isArray(s?.exercises) ? s.exercises : [];
            const exLines = ex
              .slice(0, 12)
              .map((e: any) => {
                const b = e?.best_set;
                if (!b) return `  • ${e?.name ?? "?"}: (no work sets)`;
                if (b.load_type === "band") {
                  const lvl = b.band_level ?? "?";
                  const mode = b.band_mode ?? "resist";
                  const cfg = b.band_config ?? "single";
                  const est = b.band_est_lbs != null ? `~${b.band_est_lbs}` : "";
                  return `  • ${e?.name ?? "?"}: B${lvl} ${mode}/${cfg}${est} x${b.reps}${b.rpe != null ? ` @${b.rpe}` : ""}`;
                }
                return `  • ${e?.name ?? "?"}: ${b.weight_lbs ?? "?"}x${b.reps}${b.rpe != null ? ` @${b.rpe}` : ""}`;
              })
              .join("\n");
            return [`- ${s?.day_date ?? "?"} ${s?.title ?? "Session"}`, exLines].join("\n");
          })
          .join("\n")
      : "- (no recent workouts in window)",
    "",
    "Coach Core (deterministic v2.6 summary object):",
    safeJson(core),
  ].join("\n");
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

    let body: any = null;
    try {
      body = event.body ? JSON.parse(event.body) : null;
    } catch {
      body = null;
    }
    const summary = buildPrompt(body) || pickSummary(body);

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
      "You are Rev, a no-BS hybrid bodybuilding coach for a 60-year-old lifter using the offline-first Rebuild @ 60 Tracker.",
      "Tone: practical, encouraging, slightly profane, old-school training mindset. No fluff.",
      "Hard rules:",
      "- Use ONLY the numbers and facts provided in the payload. If data is missing, say it's missing.",
      "- This is an AI add-on. Do NOT override deterministic Coach v2.6. Add context, pattern-spotting, and next actions.",
      "- No medical claims. If warning symptoms are mentioned, advise clinician.",
      "Output format (MUST follow):",
      "1) HEADLINE: one line.",
      "2) WHAT I'M SEEING: 3–6 bullets (training + quick log trends).",
      "3) NEXT SESSION TARGETS: bullets. Include key compounds if present (bench/squat/deadlift) and 2–4 accessories. If bands are present, include band targets.",
      "4) THIS WEEK'S FOCUS: 1–2 bullets.",
      "5) RECOVERY CHECK: one line (sleep/protein/zone2) and a conservative option if fatigue is high.",
    ].join("\n");

    const userPrompt = [
      "Here is a structured training + quick log snapshot from the app.",
      "Make it actionable, conservative, and specific. Keep it punchy.",
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
        ts: Date.now(),
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





