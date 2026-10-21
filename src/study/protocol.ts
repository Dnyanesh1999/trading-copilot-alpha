export const CONSENT_VERSION = "rehearsal-2026-10-18-v1";
export const STUDY_BUILD = "study-rehearsal-stage1-v2";
export const TASKS = [
  {
    id: "strategy",
    label: "Describe your strategy",
    description:
      "Use the AI clarification step, or record why it could not be used.",
  },
  {
    id: "rules",
    label: "Confirm your rules",
    description: "Inspect the checklist and explicitly confirm it.",
  },
  {
    id: "review",
    label: "Explore the evidence",
    description: "Review trades and open at least one supporting finding.",
  },
  {
    id: "action",
    label: "Save your next action",
    description: "Choose an action and successfully save the review.",
  },
] as const;
export type TaskId = (typeof TASKS)[number]["id"];
export const taskIds = TASKS.map((t) => t.id);
export const ratingIds = [
  ...Array.from(
    { length: 10 },
    (_, i) => `SUS${String(i + 1).padStart(2, "0")}`,
  ),
  "USEFUL",
  "TRUST",
  "WEEKLY",
];
export const SUS_ITEMS = [
  "I think that I would like to use this system frequently.",
  "I found the system unnecessarily complex.",
  "I thought the system was easy to use.",
  "I think that I would need the support of a technical person to be able to use this system.",
  "I found the various functions in this system were well integrated.",
  "I thought there was too much inconsistency in this system.",
  "I would imagine that most people would learn to use this system very quickly.",
  "I found the system very cumbersome to use.",
  "I felt very confident using the system.",
  "I needed to learn a lot of things before I could get going with this system.",
];
export const PROJECT_ITEMS = [
  "The review helped me understand how the documented trades related to the rules I confirmed.",
  "I consider the review findings trustworthy for the evidence shown.",
  "If this tool were available, I would intend to use it as part of my weekly trade review.",
];
export type StudyEvent = {
  eventId: string;
  sequence: number;
  at: string;
  type:
    | "task_started"
    | "task_completed"
    | "visible_interval"
    | "evidence_opened"
    | "ai_proposals"
    | "ai_outcomes";
  taskId: TaskId;
  durationMs?: number;
  counts?: number[];
};
export type Assessment = {
  taskId: TaskId;
  completed: "yes" | "partly" | "no";
  neededHelp: "yes" | "no" | null;
};
export type FinishData = {
  ratings: Record<string, number | null>;
  assessments: Assessment[];
  comment: string;
  theme: "usefulness" | "clarity" | "trust" | "missing feature" | "bug";
  noIdentifiers: boolean;
};
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function validateStudyEvent(v: unknown): StudyEvent | null {
  if (
    !isRecord(v) ||
    !uuid.test(String(v.eventId)) ||
    !Number.isSafeInteger(v.sequence) ||
    (v.sequence as number) < 1 ||
    typeof v.at !== "string" ||
    !Number.isFinite(Date.parse(v.at)) ||
    new Date(v.at).toISOString() !== v.at ||
    !taskIds.includes(v.taskId as TaskId) ||
    ![
      "task_started",
      "task_completed",
      "visible_interval",
      "evidence_opened",
      "ai_proposals",
      "ai_outcomes",
    ].includes(String(v.type))
  )
    return null;
  const extra =
    v.type === "visible_interval"
      ? "durationMs"
      : ["ai_proposals", "ai_outcomes"].includes(String(v.type))
        ? "counts"
        : null;
  const keys = [
    "eventId",
    "sequence",
    "at",
    "type",
    "taskId",
    ...(extra ? [extra] : []),
  ];
  if (
    Object.keys(v).length !== keys.length ||
    !keys.every((k) => Object.hasOwn(v, k))
  )
    return null;
  if (
    extra === "durationMs" &&
    (!Number.isSafeInteger(v.durationMs) ||
      (v.durationMs as number) < 0 ||
      (v.durationMs as number) > 3600000)
  )
    return null;
  if (
    extra === "counts" &&
    (!Array.isArray(v.counts) ||
      v.counts.length !== (v.type === "ai_outcomes" ? 5 : 2) ||
      !v.counts.every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 100))
  )
    return null;
  if (
    v.type === "ai_outcomes" &&
    Array.isArray(v.counts) &&
    v.counts[1] + v.counts[2] + v.counts[3] !== v.counts[0]
  )
    return null;
  return {
    eventId: v.eventId as string,
    sequence: v.sequence as number,
    at: v.at,
    type: v.type as StudyEvent["type"],
    taskId: v.taskId as TaskId,
    ...(extra === "durationMs"
      ? { durationMs: v.durationMs as number }
      : extra === "counts"
        ? { counts: [...(v.counts as number[])] }
        : {}),
  };
}
export function validateFinish(v: unknown): v is FinishData {
  return (
    isRecord(v) &&
    Object.keys(v).sort().join(",") ===
      "assessments,comment,noIdentifiers,ratings,theme" &&
    isRecord(v.ratings) &&
    Object.keys(v.ratings).length === 13 &&
    ratingIds.every(
      (id) =>
        Object.hasOwn(v.ratings as object, id) &&
        ((v.ratings as Record<string, unknown>)[id] === null ||
          (Number.isInteger((v.ratings as Record<string, unknown>)[id]) &&
            Number((v.ratings as Record<string, unknown>)[id]) >= 1 &&
            Number((v.ratings as Record<string, unknown>)[id]) <= 5)),
    ) &&
    Array.isArray(v.assessments) &&
    v.assessments.length === 4 &&
    new Set(v.assessments.map((a) => (isRecord(a) ? a.taskId : null))).size ===
      4 &&
    v.assessments.every(
      (a) =>
        isRecord(a) &&
        Object.keys(a).sort().join(",") === "completed,neededHelp,taskId" &&
        taskIds.includes(a.taskId as TaskId) &&
        ["yes", "partly", "no"].includes(String(a.completed)) &&
        (a.neededHelp === null || ["yes", "no"].includes(String(a.neededHelp))),
    ) &&
    typeof v.comment === "string" &&
    v.comment.length <= 1500 &&
    ["usefulness", "clarity", "trust", "missing feature", "bug"].includes(
      String(v.theme),
    ) &&
    v.noIdentifiers === true &&
    !/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\d[\d\s()+-]{7,}\d/.test(v.comment)
  );
}
export function csv(
  rows: Record<string, unknown>[],
  columns: string[],
): string {
  const cell = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/^[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return (
    [
      columns.map(cell).join(","),
      ...rows.map((row) => columns.map((c) => cell(row[c])).join(",")),
    ].join("\r\n") + "\r\n"
  );
}
