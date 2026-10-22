import { now, campus, at, ZONE, HOUR } from "./time.js";

const featureTerms = [
  ["projector", "projector"],
  ["whiteboard", "whiteboard"],
  ["computer", "computers"],
  ["hybrid", "hybrid"],
  ["video conferencing", "hybrid"],
  ["microphone", "microphone"],
  ["display", "display"],
  ["3d printer", "3d printer"],
];
const accessibility = /\b(accessible|wheelchair|step.free|ada|no stairs)\b/i;
export function interpret(prompt, today = now()) {
  const text = prompt.toLowerCase(),
    capacity = text.match(
      /\bfor\s+(\d{1,3})\s+(?:people|students?|attendees?|persons?|seats?)\b|\b(?:seats?|capacity\s*(?:of|for)?)\s*(\d{1,3})\b|\b(\d{1,3})\s+(?:people|students?|attendees?|persons?)\b/,
    );
  const type = /portable projector|camera kit|equipment/.test(text)
    ? "equipment"
    : text.includes("lab")
      ? "lab"
      : text.includes("study")
        ? "study"
        : /classroom|lecture/.test(text)
          ? "classroom"
          : /room|space/.test(text)
            ? "room"
            : null;
  const features = [
    ...new Set(
      featureTerms
        .filter(([phrase]) => text.includes(phrase))
        .map(([, feature]) => feature),
    ),
  ];
  const query = text.includes("library")
    ? "library"
    : text.includes("innovation center")
      ? "innovation"
      : text.includes("east hall")
        ? "east hall"
        : text.includes("west hall")
          ? "west hall"
          : null;
  let date = null,
    start = null,
    end = null;
  const explicit = text.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (explicit && campus(explicit[0]).isValid) date = campus(explicit[0]);
  else if (text.includes("tomorrow")) date = today.plus({ days: 1 });
  else if (text.includes("today")) date = today;
  else {
    const weekday = text.match(
      /\b(?:(next|this|on)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
    );
    if (weekday) {
      const target =
        [
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
          "sunday",
        ].indexOf(weekday[2]) + 1;
      const days =
        weekday[1] === "next"
          ? ((8 - today.weekday) % 7 || 7) + target - 1
          : (target - today.weekday + 7) % 7 || 7;
      date = today.plus({ days });
    }
  }
  if (date) {
    const period = /afternoon|evening/.test(text)
      ? "pm"
      : text.includes("morning")
        ? "am"
        : "";
    const hour = (value, meridiem) =>
      meridiem
        ? +value < 1 || +value > 12
          ? NaN
          : (+value % 12) + (meridiem === "pm" ? 12 : 0)
        : +value <= 23
          ? +value
          : NaN;
    const range = text.match(
      /\b(?:between|from)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:and|to|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/,
    );
    const single = text.match(
      /\b(?:at|around)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/,
    );
    let times = text.includes("afternoon")
      ? [12, 0, 17, 0]
      : text.includes("morning")
        ? [8, 0, 12, 0]
        : text.includes("evening")
          ? [17, 0, 21, 0]
          : [9, 0, 17, 0];
    if (range) {
      const [, h1, m1, a1, h2, m2, a2] = range;
      const firstMeridiem = a1 || a2 || period,
        secondMeridiem = a2 || (!a1 ? period : "");
      let first = hour(h1, firstMeridiem),
        second = hour(h2, secondMeridiem);
      if (
        first > second &&
        firstMeridiem === secondMeridiem &&
        firstMeridiem === "pm"
      )
        first -= 12;
      if (
        Number.isFinite(first) &&
        Number.isFinite(second) &&
        +(m1 || 0) < 60 &&
        +(m2 || 0) < 60
      )
        times = [first, +(m1 || 0), second, +(m2 || 0)];
    } else if (single) {
      const h = hour(single[1], single[3] || period),
        m = +(single[2] || 0),
        duration = text.match(/\bfor\s+(\d{1,3})\s*(hours?|minutes?)\b/);
      const length = duration
        ? Math.max(
            30,
            Math.min(
              720,
              +duration[1] * (duration[2].startsWith("hour") ? 60 : 1),
            ),
          )
        : 120;
      const finish = h * 60 + m + length;
      if (Number.isFinite(h) && m < 60)
        times = [h, m, Math.floor(finish / 60) % 24, finish % 60];
    }
    start = at(date.toISODate(), times[0], times[1]);
    end = at(date.toISODate(), times[2], times[3]);
    if (campus(end) <= campus(start))
      end = campus(end).plus({ days: 1 }).toISO();
  }
  return {
    query,
    type,
    minCapacity: capacity ? Number(capacity.slice(1).find(Boolean)) : null,
    features,
    accessible: accessibility.test(text) ? true : null,
    start,
    end,
  };
}
export async function extract(
  prompt,
  baseline,
  resources,
  {
    key = process.env.OPENAI_API_KEY,
    model = process.env.OPENAI_MODEL || "gpt-4.1-mini",
    fetcher = fetch,
    onFailure = (reason) => console.warn(JSON.stringify({ event: "search_provider_unavailable", reason })),
    timeoutMs = Math.max(1000, Math.min(20000, Number(process.env.OPENAI_TIMEOUT_MS) || 10000)),
  } = {},
) {
  if (!key) return null;
  const nullable = (type) => ({ type: [type, "null"] });
  const properties = {
    query: nullable("string"),
    type: nullable("string"),
    minCapacity: nullable("integer"),
    features: { type: "array", items: { type: "string" } },
    accessible: nullable("boolean"),
    date: nullable("string"),
    startTime: nullable("string"),
    endTime: nullable("string"),
  };
  try {
    const response = await fetcher("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: 1024,
        ...(/^gpt-6-(?:sol|luna)(?:-|$)/.test(model) ? { reasoning: { effort: "none" } } : {}),
        input: [
          {
            role: "system",
            content: `Extract campus room search filters grounded in the request. Today is ${now().toISODate()}, timezone ${ZONE}. Use null for unspecified fields, YYYY-MM-DD dates and HH:mm times. Next weekday means next calendar week. Types: room, classroom, lab, study, equipment. Features: projector, whiteboard, computers, hybrid, microphone, display, 3d printer, portable, camera, workbenches.`,
          },
          { role: "user", content: prompt },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "booking_filters",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties,
              required: Object.keys(properties),
            },
          },
        },
      }),
    });
    if (!response.ok) {
      onFailure(`http_${response.status}`);
      return null;
    }
    const body = await response.json();
    if (body.status !== "completed") { onFailure("incomplete_response"); return null; }
    const output = body.output
      ?.flatMap((item) => item.content ?? [])
      .find((part) => part.type === "output_text")?.text;
    const fields = JSON.parse(output);
    if (
      !fields ||
      !Array.isArray(fields.features) ||
      fields.features.some((f) => typeof f !== "string")
    )
      return null;
    const text = prompt.toLowerCase(),
      known = new Set(
        resources.flatMap((r) => r.features).map((f) => f.toLowerCase()),
      );
    const grounded = (f) =>
      text.includes(f) ||
      (f === "computers" && /computer|\bpcs?\b/.test(text)) ||
      (f === "hybrid" && /video conference|zoom/.test(text)) ||
      (f === "whiteboard" && /white board|sketch|brainstorm|erasable|write on/.test(text)) ||
      (f === "3d printer" && text.includes("3-d printer"));
    const features = [
      ...new Set([
        ...baseline.features,
        ...fields.features
          .map((f) => f.toLowerCase())
          .filter((f) => known.has(f) && grounded(f)),
      ]),
    ].slice(0, 8);
    let { start, end } = baseline;
    if (
      !start &&
      /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month|october|november|december|january|february|march|april|may|june|july|august|september|\d{4}-\d{2}-\d{2})\b/i.test(
        prompt,
      ) &&
      /^\d{4}-\d{2}-\d{2}$/.test(fields.date) &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(fields.startTime) &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(fields.endTime)
    ) {
      const date = campus(fields.date),
        s = campus(`${fields.date}T${fields.startTime}`),
        e = campus(`${fields.date}T${fields.endTime}`),
        today = now().startOf("day");
      if (
        date >= today.minus({ days: 1 }) &&
        date <= today.plus({ days: 366 }) &&
        e > s &&
        e - s <= 12 * HOUR
      ) {
        start = s.toISO();
        end = e.toISO();
      }
    }
    return {
      ...baseline,
      features,
      start,
      end,
      type:
        baseline.type ??
        (["room", "classroom", "lab", "study", "equipment"].includes(
          fields.type,
        )
          ? fields.type
          : null),
      query:
        baseline.query ??
        (typeof fields.query === "string" &&
        fields.query.length > 1 &&
        fields.query.length <= 60 &&
        text.includes(fields.query.toLowerCase())
          ? fields.query
          : null),
      minCapacity:
        Number.isInteger(fields.minCapacity) &&
        fields.minCapacity >= 1 &&
        fields.minCapacity <= 500 &&
        new RegExp(`\\b${fields.minCapacity}\\b`).test(prompt)
          ? Math.max(baseline.minCapacity ?? 0, fields.minCapacity)
          : baseline.minCapacity,
      accessible:
        baseline.accessible === true ||
        (fields.accessible === true && accessibility.test(prompt))
          ? true
          : baseline.accessible,
    };
  } catch {
    onFailure("timeout_or_invalid_response");
    return null;
  }
}
