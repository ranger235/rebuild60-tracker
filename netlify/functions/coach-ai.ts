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

  const qSorted = [...qRecent].sort((a, b) => (parseDate(a.day_date) ?? 0) - (parseDate(b.day_date) ?? 0));
  const last7 = qSorted.slice(-7);
  const last14 = qSorted.slice(-14);
  const last3 = qSorted.slice(-3);

  const basicsDays7 = last7.reduce((acc, d) => {
    const sleep = safeNum(d.sleep_hours);
    const protein = safeNum(d.protein_g);
    return acc + (sleep != null && protein != null ? 1 : 0);
  }, 0);

  const qEntries7 = last7.length;
  const qEntries14 = last14.length;

  const weights14 = last14.map(d => safeNum(d.weight_lbs)).filter((x): x is number => x != null);
  const waist14 = last14.map(d => safeNum(d.waist_in)).filter((x): x is number => x != null);

  const sleep3 = last3.map(d => safeNum(d.sleep_hours)).filter((x): x is number => x != null);
  const sleep7 = last7.map(d => safeNum(d.sleep_hours)).filter((x): x is number => x != null);
  const protein3 = last3.map(d => safeNum(d.protein_g)).filter((x): x is number => x != null);
  const protein7 = last7.map(d => safeNum(d.protein_g)).filter((x): x is number => x != null);
  const z27 = last7.map(d => safeNum(d.zone2_minutes)).filter((x): x is number => x != null);

  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  const avgSleep3 = avg(sleep3);
  const avgSleep7 = avg(sleep7);
  const avgProtein3 = avg(protein3);
  const avgProtein7 = avg(protein7);
  const totalZone2Min7 = z27.reduce((a, b) => a + b, 0);
  const zone2Days7 = last7.reduce((acc, d) => acc + (safeNum(d.zone2_minutes) != null && safeNum(d.zone2_minutes)! > 0 ? 1 : 0), 0);

  const wtDelta14 = weights14.length >= 2 ? weights14[weights14.length - 1] - weights14[0] : null;
  const waistDelta14 = waist14.length >= 2 ? waist14[waist14.length - 1] - waist14[0] : null;
  const wtPct14 =
    weights14.length >= 2 && weights14[0] > 0 ? ((weights14[weights14.length - 1] - weights14[0]) / weights14[0]) * 100 : null;

  // Training window stats
  const wSorted = [...workouts].sort((a, b) => (parseDate(a.day_date) ?? 0) - (parseDate(b.day_date) ?? 0));
  const wLast6 = wSorted.slice(-6);
  const sessionsRecent = wLast6.length;
  const totalTonnageRecent = wLast6.reduce((acc, s) => acc + (safeNum(s.tonnage_lbs) ?? 0), 0);
  const totalSetsRecent = wLast6.reduce((acc, s) => acc + (safeNum(s.set_count) ?? 0), 0);

  // Spike estimate (compare last 3 sessions tonnage vs previous 3)
  const wLast3 = wLast6.slice(-3);
  const wPrev3 = wLast6.slice(0, Math.max(0, wLast6.length - 3)).slice(-3);
  const tonLast3 = wLast3.reduce((acc, s) => acc + (safeNum(s.tonnage_lbs) ?? 0), 0);
  const tonPrev3 = wPrev3.reduce((acc, s) => acc + (safeNum(s.tonnage_lbs) ?? 0), 0);
  const spikePctApprox = tonPrev3 > 0 ? ((tonLast3 - tonPrev3) / tonPrev3) * 100 : null;
  const spikeClamped = spikePctApprox != null ? clamp(spikePctApprox, -99, 300) : null;

  // Parse notes for "green vs red" joint signals (simple, conservative)
  const notesAll = [body?.quick_log_today?.notes, ...qRecent.map((d: any) => d?.notes)]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  const has = (re: RegExp) => re.test(notesAll);
  const pos = /\b(behaving|good|fine|ok|okay|better|improving|stable|solid)\b/;
  const neg = /\b(pain|hurt|sore|ache|tight|tweak|flare|worse|bad)\b/;

  const kneeMention = has(/\bknee\b/);
  const backMention = has(/\b(back|lower\s*back)\b/);
  const shoulderMention = has(/\b(shoulder|rotator)\b/);

  const hasNeg = has(neg);
  const hasPos = has(pos);

  // A joint flag is "active" only if mentioned AND negative sentiment is present.
  // If user says "knee/back behaving", we treat it as NOT active.
  const jointFlags = {
    knee: kneeMention && hasNeg && !hasPos,
    back: backMention && hasNeg && !hasPos,
    shoulder: shoulderMention && hasNeg && !hasPos,
  };

  const pain = has(/\b(pain|hurt|sore)\b/) && hasNeg;
  const fatigue = has(/\b(fatigue|tired|exhausted|wrecked)\b/);

  // Data confidence
  let confidence: "HIGH" | "MEDIUM" | "LOW" = "LOW";
  const hasWorkouts = wLast6.length > 0;
  const hasTrends = qEntries14 >= 4;
  const hasBasics = basicsDays7 >= 3;
  if (hasWorkouts && hasTrends && hasBasics) confidence = "HIGH";
  else if (hasWorkouts && (hasTrends || basicsDays7 >= 1)) confidence = "MEDIUM";

  // Recovery budget (conservative heuristic)
  // Start at GREEN and add penalties; then apply small buffs.
  let budgetScore = 0;
  if (spikeClamped == null) budgetScore += 1; // unknown load adds uncertainty
  else if (spikeClamped > 40) budgetScore += 2;
  else if (spikeClamped > 25) budgetScore += 1;

  if (pain) budgetScore += 2;
  if (jointFlags.knee || jointFlags.back || jointFlags.shoulder) budgetScore += 1;
  if (fatigue) budgetScore += 1;

  if (avgSleep3 != null) {
    if (avgSleep3 < 5.5) budgetScore += 2;
    else if (avgSleep3 < 6.5) budgetScore += 1;
  } else {
    budgetScore += 1;
  }

  // Protein governor: use ratio if bodyweight exists, else absolute threshold.
  const bw = safeNum(body?.quick_log_today?.weight_lbs) ?? (weights14.length ? weights14[weights14.length - 1] : null);
  const proteinTarget3 = bw != null ? 0.7 * bw : 150;
  if (avgProtein3 != null && avgProtein3 < proteinTarget3) budgetScore += 1;
  if (wtPct14 != null && wtPct14 <= -2) budgetScore += 1; // losing >~1%/wk

  // Zone 2 provides a small recovery buffer.
  if (zone2Days7 >= 3) budgetScore -= 1;

  const recoveryBudget: "GREEN" | "YELLOW" | "RED" = budgetScore >= 4 ? "RED" : budgetScore >= 2 ? "YELLOW" : "GREEN";

  // Governor (speed limit)
  const rpeCap = (() => {
    if (avgSleep3 != null && avgSleep3 < 6.5) return 7;
    if (recoveryBudget === "RED") return 7;
    return 8;
  })();

  const allowLoadIncrease =
    recoveryBudget === "GREEN" &&
    basicsDays7 >= 4 &&
    (avgSleep3 == null || avgSleep3 >= 6.5) &&
    (avgProtein3 == null || avgProtein3 >= proteinTarget3) &&
    !pain;

  const allowVolumeIncrease = recoveryBudget === "GREEN" && basicsDays7 >= 5 && !pain;

  // Find last top-set loads for patterns (best effort)
  const patternTop = (() => {
    const out: Record<string, number | null> = { push: null, lower: null, hinge: null, pull: null };
    const rePush = /\b(bench|incline|press|ohp|overhead)\b/i;
    const reLower = /\b(squat|ssb|safety\s*squat|split\s*squat|lunge|leg\s*press)\b/i;
    const reHinge = /\b(deadlift|rdl|romanian|hinge|good\s*morning)\b/i;
    const rePull = /\b(row|pulldown|pullup|chin)\b/i;

    // Walk workouts from most recent to oldest and record first seen top-set per pattern.
    const sortedDesc = [...workouts].sort((a, b) => (parseDate(b.day_date) ?? 0) - (parseDate(a.day_date) ?? 0));
    for (const s of sortedDesc) {
      const ex = Array.isArray(s?.exercises) ? s.exercises : [];
      for (const e of ex) {
        const name = (e?.name ?? "").toString();
        const bs = e?.best_set;
        const w = bs && bs.load_type !== "band" ? safeNum(bs.weight_lbs) : null;
        if (w == null) continue;

        const trySet = (k: string, ok: boolean) => {
          if (ok && out[k] == null) out[k] = w;
        };

        trySet("push", rePush.test(name));
        trySet("lower", reLower.test(name));
        trySet("hinge", reHinge.test(name));
        trySet("pull", rePull.test(name));
      }
      if (Object.values(out).every(v => v != null)) break;
    }
    return out;
  })();

  const deload = (() => {
    const deloadWeek = recoveryBudget === "RED" && spikeClamped != null && spikeClamped >= 40;
    const kneeDeload = jointFlags.knee;
    const backDeload = jointFlags.back;
    const shoulderDeload = jointFlags.shoulder;

    // Systemic deload if deloadWeek OR pain+fatigue combo
    const systemic = deloadWeek || (recoveryBudget === "RED" && (pain || fatigue));

    const pattern = {
      full: systemic,
      lower: !systemic && (kneeDeload || backDeload),
      push: !systemic && shoulderDeload,
      pull: !systemic && false, // reserved for future "elbow" etc
    };

    const active = pattern.full || pattern.lower || pattern.push || pattern.pull;

    const startDate = new Date().toISOString().slice(0, 10);
    const tag = active ? "DELOAD" : null;

    const pct = 0.65;
    const prescribe = (w: number | null) => (w != null ? Math.round((w * pct) / 5) * 5 : null);

    const loads = {
      push: prescribe(patternTop.push),
      lower: prescribe(patternTop.lower),
      hinge: prescribe(patternTop.hinge),
      pull: prescribe(patternTop.pull),
    };

    // Equipment-aware substitution suggestions (based on known user setup)
    const substitutions = {
      lower: [
        "Leverage squat (upright, controlled depth)",
        "Reverse sled drags (if available) or forward drags light",
        "Split squat to comfortable depth",
        "Leg extension / curl (if joints tolerate)",
      ],
      push: [
        "DB press (neutral grip) or machine/leverage press",
        "Incline DB press over barbell bench if shoulder cranky",
        "Push-ups / close-grip pushups",
      ],
      hinge: [
        "Hip thrust / glute bridge",
        "Ham curl (machine or bench attachment)",
        "Back extension (easy) if pain-free",
      ],
    };

    return {
      active,
      pattern,
      startDate: active ? startDate : null,
      durationDays: active ? 7 : 0,
      tag,
      percent: pct,
      loadsLbs: loads,
      substitutions,
    };
  })();

  const oneThingToLogTomorrow = (() => {
    const sleepMissing = body?.quick_log_today?.sleep_hours == null;
    const proteinMissing = body?.quick_log_today?.protein_g == null;
    if (sleepMissing && proteinMissing) return "Sleep hours + protein grams.";
    if (sleepMissing) return "Sleep hours.";
    if (proteinMissing) return "Protein grams.";
    if (body?.quick_log_today?.weight_lbs == null) return "Morning bodyweight.";
    if (body?.quick_log_today?.zone2_minutes == null) return "Zone 2 minutes.";
    return "A 1-line note on joints/energy.";
  })();

  return {
    quickLog: {
      entries7: qEntries7,
      entries14: qEntries14,
      basicsDays7,
      wtDelta14,
      wtPct14,
      waistDelta14,
      avgSleep3,
      avgSleep7,
      avgProtein3,
      avgProtein7,
      proteinTarget3: bw != null ? Math.round(proteinTarget3) : proteinTarget3,
      totalZone2Min7,
      zone2Days7,
    },
    training: {
      sessionsRecent,
      totalTonnageRecent,
      totalSetsRecent,
      spikePctApprox: spikeClamped,
      patternTopSetLbs: patternTop,
    },
    flags: {
      ...jointFlags,
      pain,
      fatigue,
    },
    governor: {
      rpeCap,
      allowLoadIncrease,
      allowVolumeIncrease,
    },
    deload,
    confidence,
    recoveryBudget,
    oneThingToLogTomorrow,
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
      "- Conservative progression for compounds (bench/squat/deadlift): only increase load when the last comparable work was clean (no grinders) and signals are GREEN/YELLOW-safe.",
      "- Quick Log is a GOVERNOR: you MUST use sleep/protein/bodyweight/joint notes/Zone2 to change the plan, not merely repeat them.",
      "- Obey governor + deload objects from DERIVED SIGNALS. If deload.active is true, you MUST prescribe a deload (full or pattern) with the computed loads and substitutions.",
      "- Keep it punchy. No long lectures. No endless 'Missing:' lists.",
      "- No medical claims. If warning symptoms appear, advise clinician.",
      "Output format (MUST follow exactly):",
      "1) REALITY CHECK",
      "   - First line must be a one-sentence headline. If DERIVED SIGNALS.deload.active is true, the headline MUST start with 'DELOAD' and specify FULL / LOWER / PUSH.",
      "   - Then give 4-6 bullets covering entries (7d/14d), basics days (7d), sleep avg (3d + 7d if available), protein avg (3d + target), bodyweight trend (14d % if available), Zone 2 (days + minutes in 7d), joint signal summary, and latest note (or 'no note').",
      "2) WHAT IMPROVED",
      "   - Give exactly 2 bullets on training snapshot wins or stable positives (sessions/tonnage/sets, best lifts if present, useful compliance). If nothing improved, say so plainly.",
      "3) WHAT NEEDS TIGHTENING",
      "   - Give exactly 3 bullets covering governor impact, data confidence, and recovery budget. You MUST explicitly name the Quick Log signals driving the call (sleep/protein/joints/BW/Z2).",
      "4) NEXT MOVE",
      "   - Give max 3 bullets for next session targets. Must obey governor/deload. At least one bullet must be directly tied to Quick Log/governor.",
      "   - Then add exactly 1 bullet labeled 'Do not do:' and exactly 1 bullet labeled 'Log tomorrow:'",
      "Style: direct, encouraging, slightly profane. Traditional training mindset. No fluff. Same coach readout voice used across the app.",
    ].join("\n");

    const userPrompt = [
      "Here is a structured training + quick log snapshot from the app.",
      "Make it actionable, conservative, specific, and consistent with the coach readout voice. Keep it punchy.",
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













