import type { Handler } from "@netlify/functions";

type OpenAIResponse = any;

type QuickLogRow = {
  day_date?: string;
  weight_lbs?: number | null;
  waist_in?: number | null;
  sleep_hours?: number | null;
  calories?: number | null;
  protein_g?: number | null;
  zone2_minutes?: number | null;
  notes?: string | null;
};

type WorkoutBestSet = {
  load_type?: "weight" | "band" | "bodyweight" | string;
  weight_lbs?: number | null;
  reps?: number | null;
  rpe?: number | null;
  band_level?: number | string | null;
  band_mode?: string | null;
  band_config?: string | null;
  band_est_lbs?: number | null;
};

type WorkoutExercise = {
  name?: string;
  best_set?: WorkoutBestSet | null;
};

type WorkoutSession = {
  day_date?: string;
  title?: string;
  exercises?: WorkoutExercise[];
  tonnage_lbs?: number | null;
  set_count?: number | null;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function safeNum(v: any): number | null {
  const n = typeof v === "number" ? v : v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseDate(d?: string): number | null {
  if (!d || typeof d !== "string") return null;
  const t = Date.parse(d);
  return Number.isFinite(t) ? t : null;
}

function deriveSignals(body: any) {
  const qRecent: QuickLogRow[] = Array.isArray(body?.quick_log_recent) ? body.quick_log_recent : [];
  const workouts: WorkoutSession[] = Array.isArray(body?.recent_workouts) ? body.recent_workouts : [];

  // Quick Log window stats
  const qSorted = [...qRecent].sort((a, b) => (parseDate(a.day_date) ?? 0) - (parseDate(b.day_date) ?? 0));
  const last7 = qSorted.slice(-7);
  const last14 = qSorted.slice(-14);

  const basicsDays = last7.reduce((acc, d) => {
    const sleep = safeNum(d.sleep_hours);
    const protein = safeNum(d.protein_g);
    return acc + (sleep != null && protein != null ? 1 : 0);
  }, 0);
  const qEntries7 = last7.length;
  const qEntries14 = last14.length;

  const weights14 = last14.map(d => safeNum(d.weight_lbs)).filter((x): x is number => x != null);
  const waist14 = last14.map(d => safeNum(d.waist_in)).filter((x): x is number => x != null);
  const sleep7 = last7.map(d => safeNum(d.sleep_hours)).filter((x): x is number => x != null);
  const protein7 = last7.map(d => safeNum(d.protein_g)).filter((x): x is number => x != null);
  const z27 = last7.map(d => safeNum(d.zone2_minutes)).filter((x): x is number => x != null);

  const wtDelta = weights14.length >= 2 ? weights14[weights14.length - 1] - weights14[0] : null;
  const waistDelta = waist14.length >= 2 ? waist14[waist14.length - 1] - waist14[0] : null;

  // Training window stats
  const wSorted = [...workouts].sort((a, b) => (parseDate(a.day_date) ?? 0) - (parseDate(b.day_date) ?? 0));
  const wLast6 = wSorted.slice(-6);
  const sessionsRecent = wLast6.length;
  const totalTonnage = wLast6.reduce((acc, s) => acc + (safeNum(s.tonnage_lbs) ?? 0), 0);
  const totalSets = wLast6.reduce((acc, s) => acc + (safeNum(s.set_count) ?? 0), 0);

  // Spike estimate (compare last 3 sessions tonnage vs previous 3)
  const last3 = wLast6.slice(-3);
  const prev3 = wLast6.slice(0, Math.max(0, wLast6.length - 3));
  const tonLast3 = last3.reduce((acc, s) => acc + (safeNum(s.tonnage_lbs) ?? 0), 0);
  const tonPrev3 = prev3.slice(-3).reduce((acc, s) => acc + (safeNum(s.tonnage_lbs) ?? 0), 0);
  const spikePct = tonPrev3 > 0 ? ((tonLast3 - tonPrev3) / tonPrev3) * 100 : null;

  // Pain/fatigue flags from notes
  const noteText = [body?.quick_log_today?.notes, ...qRecent.map((d: any) => d?.notes)]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  const flags = {
    knee: /\bknee\b/.test(noteText),
    back: /\bback\b/.test(noteText) || /\blower\s*back\b/.test(noteText),
    shoulder: /\bshoulder\b/.test(noteText) || /\brotator\b/.test(noteText),
    pain: /\bpain\b/.test(noteText) || /\bhurt\b/.test(noteText) || /\bsore\b/.test(noteText),
  };

  // Data confidence
  let confidence: "HIGH" | "MEDIUM" | "LOW" = "LOW";
  const hasWorkouts = wLast6.length > 0;
  const hasTrends = qEntries14 >= 4;
  const hasBasics = basicsDays >= 3;
  if (hasWorkouts && hasTrends && hasBasics) confidence = "HIGH";
  else if (hasWorkouts && (hasTrends || basicsDays >= 1)) confidence = "MEDIUM";

  // Recovery budget (conservative heuristic)
  const avgSleep = sleep7.length ? sleep7.reduce((a, b) => a + b, 0) / sleep7.length : null;
  const budgetScore =
    (spikePct != null ? (spikePct > 40 ? 2 : spikePct > 25 ? 1 : 0) : 1) +
    (flags.pain ? 1 : 0) +
    (avgSleep != null ? (avgSleep < 5.5 ? 2 : avgSleep < 6.5 ? 1 : 0) : 1);
  const budget = budgetScore >= 4 ? "RED" : budgetScore >= 2 ? "YELLOW" : "GREEN";

  const oneThing = (() => {
    const sleepMissing = body?.quick_log_today?.sleep_hours == null;
    const proteinMissing = body?.quick_log_today?.protein_g == null;
    if (sleepMissing && proteinMissing) return "Sleep hours + protein grams.";
    if (sleepMissing) return "Sleep hours.";
    if (proteinMissing) return "Protein grams.";
    if (body?.quick_log_today?.weight_lbs == null) return "Morning bodyweight.";
    return "A 1-line note on joints/energy.";
  })();

  const spike = spikePct != null ? clamp(spikePct, -99, 300) : null;

  return {
    quickLog: {
      entries7: qEntries7,
      entries14: qEntries14,
      basicsDays7: basicsDays,
      wtDelta14: wtDelta,
      waistDelta14: waistDelta,
      avgSleep7: avgSleep,
      avgProtein7: protein7.length ? protein7.reduce((a, b) => a + b, 0) / protein7.length : null,
      totalZone2Min7: z27.reduce((a, b) => a + b, 0),
    },
    training: {
      sessionsRecent,
      totalTonnageRecent: totalTonnage,
      totalSetsRecent: totalSets,
      spikePctApprox: spike,
    },
    flags,
    confidence,
    recoveryBudget: budget,
    oneThingToLogTomorrow: oneThing,
  };
}

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
  const signals = deriveSignals(body);

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
    "",
    "DERIVED SIGNALS (computed by the server; treat as ground truth):",
    safeJson(signals),
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
      "You are Rev — a no-BS garage coach (old-school, practical, a little spicy) for a 60-year-old lifter using the offline-first Rebuild @ 60 Tracker.",
      "The deterministic Coach v2.6 already computed the basics. You add context: pattern-spotting, priorities, and next actions.",
      "Hard rules:",
      "- Use ONLY the numbers and facts provided in the payload (including DERIVED SIGNALS). If data is missing, say so — do NOT invent.",
      "- Conservative progression for compounds (bench/squat/deadlift): only increase load when the last comparable work was clean (no grinders) and signals are Green/Yellow-safe.",
      "- Keep it punchy. No long lectures. No endless 'Missing:' lists.",
      "- No medical claims. If warning symptoms appear, advise clinician.",
      "Output format (MUST follow exactly):",
      "1) HEADLINE: one sentence.",
      "2) QUICK LOG SNAPSHOT: exactly 3 bullets (entries, basics days, latest note or 'no note').",
      "3) TRAINING SNAPSHOT: exactly 3 bullets (sessions/tonnage/sets, best lifts if present, and any spike/red flags).",
      "4) DATA CONFIDENCE: one line (HIGH/MEDIUM/LOW + 5–12 word reason).",
      "5) RECOVERY BUDGET: one line (GREEN/YELLOW/RED + what to do next 48h).",
      "6) NEXT SESSION TARGETS: max 3 bullets, specific. Prefer: repeat load + add 1 rep, or hold load submax. If bands present, give band target.",
      "7) DO NOT DO THIS: exactly 1 bullet.",
      "8) ONE THING TO LOG TOMORROW: exactly 1 bullet.",
      "Style: direct, encouraging, slightly profane. Traditional training mindset. No fluff.",
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







