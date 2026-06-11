/**
 * Default label taxonomy — port of backend/src/glean/labels/defaults.py
 * DEFAULT_LABELS (descriptions verbatim; they are the seed-matcher's query
 * text, so changing a word changes the embedding).
 *
 * `exclusive` marks the ACTION axis: at most one such label is current on an
 * email. Non-exclusive labels are topic TAGS that stack additively.
 */

export interface LabelSeed {
  name: string;
  needsDraft: boolean;
  color: string;
  exclusive: boolean;
  description: string;
}

export const DEFAULT_LABELS: readonly LabelSeed[] = [
  {
    name: "To Respond",
    needsDraft: true,
    color: "#ef4444",
    exclusive: true,
    description: "Needs a personal reply from you.",
  },
  {
    name: "FYI",
    needsDraft: false,
    color: "#3b82f6",
    exclusive: true,
    description: "Informational — no response expected.",
  },
  {
    name: "Comment",
    needsDraft: false,
    color: "#a855f7",
    exclusive: true,
    description: "Discussion threads you participate in but don't need to drive.",
  },
  {
    name: "Notification",
    needsDraft: false,
    color: "#64748b",
    exclusive: true,
    description: "Automated alerts from systems / apps.",
  },
  {
    name: "Meeting Update",
    needsDraft: false,
    color: "#22c55e",
    exclusive: true,
    description: "Calendar invites, reschedules, summaries.",
  },
  {
    name: "Awaiting Reply",
    needsDraft: false,
    color: "#f59e0b",
    exclusive: true,
    description: "You replied; waiting for them.",
  },
  {
    name: "Actioned",
    needsDraft: false,
    color: "#14b8a6",
    exclusive: true,
    description: "Resolved — keep for record.",
  },
  {
    name: "Marketing",
    needsDraft: false,
    color: "#6b7280",
    exclusive: true,
    description: "Newsletters and promotions.",
  },
  {
    name: "Personal",
    needsDraft: false,
    color: "#ec4899",
    exclusive: false,
    description: "Not work-related (over Fyxer).",
  },
  {
    name: "Research",
    needsDraft: false,
    color: "#0ea5e9",
    exclusive: false,
    description:
      "Grants and funding, manuscripts and submissions, peer review you are " +
      "doing, lab and collaborators, conferences, data and methods.",
  },
  {
    name: "Teaching",
    needsDraft: false,
    color: "#f97316",
    exclusive: false,
    description:
      "Courses and lectures, students and advisees, TAs, grading, office " +
      "hours, curriculum, Canvas / LMS and registrar mail.",
  },
  {
    name: "Service",
    needsDraft: false,
    color: "#8b5cf6",
    exclusive: false,
    description:
      "Department, college and university committees, faculty governance, " +
      "professional-society duties, editorial boards, community outreach.",
  },
];
