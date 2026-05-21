/**
 * MODERATION POLICY — SINGLE SOURCE OF TRUTH
 *
 * Both the backend (enforcement middleware, auto-actions) and the frontend
 * (Standing page, restriction modals) read from this file. Keep it pure data —
 * no imports, no logic, no side effects — so it can be safely shared.
 *
 * If something changes here, both the gates and the UI update together.
 */

// -----------------------------------------------------------------------------
// CAPABILITIES — every gated action in the app
// -----------------------------------------------------------------------------
// Add a new entry whenever you build a new social action. The router gates
// the action with requireCapability(<CAP>); strike levels list which caps they block.
export enum Capability {
  CREATE_POST = 'CREATE_POST',
  COMMENT_ON_POST = 'COMMENT_ON_POST',
  REACT_TO_POST = 'REACT_TO_POST',

  SEND_INBOX_DRAWING = 'SEND_INBOX_DRAWING',    // drawing → mates
  COMMENT_ON_INBOX = 'COMMENT_ON_INBOX',

  SEND_BALLOON = 'SEND_BALLOON',
  RECEIVE_BALLOON = 'RECEIVE_BALLOON',       // suspended users don't get them either

  SEND_DM = 'SEND_DM',
  SEND_MATE_REQUEST = 'SEND_MATE_REQUEST',

  CREATE_LOBBY = 'CREATE_LOBBY',
  JOIN_PUBLIC_LOBBY = 'JOIN_PUBLIC_LOBBY',
  SEND_LOBBY_MESSAGE = 'SEND_LOBBY_MESSAGE',
  DRAW_IN_LOBBY = 'DRAW_IN_LOBBY',

  CHANGE_NAME = 'CHANGE_NAME',
  CHANGE_PROFILE_IMG = 'CHANGE_PROFILE_IMG',
  FOLLOW_USER = 'FOLLOW_USER',
  REPORT_CONTENT = 'REPORT_CONTENT',        // yes, this is gated — spam reporters lose this
}

// -----------------------------------------------------------------------------
// REASONS — why content was reported
// -----------------------------------------------------------------------------
// Severity drives auto-action weighting and is shown in the user-facing
// "Your Standing" UI. minor_safety bypasses normal thresholds.
export const REPORT_REASONS = {
  minor_safety: { label: 'Endangers a minor', severity: 'critical', weight: 10 },
  nsfw: { label: 'Sexual or explicit', severity: 'high', weight: 1.5 },
  violence: { label: 'Violence or gore', severity: 'high', weight: 1.5 },
  harassment: { label: 'Harassment or bullying', severity: 'high', weight: 1.5 },
  hate_speech: { label: 'Hate speech', severity: 'high', weight: 1.5 },
  spam: { label: 'Spam or scam', severity: 'medium', weight: 1.0 },
  impersonation: { label: 'Impersonation', severity: 'medium', weight: 1.0 },
  other: { label: 'Something else', severity: 'low', weight: 0.5 }
} as const;

export type ReportReason = keyof typeof REPORT_REASONS;

// -----------------------------------------------------------------------------
// REPORTABLE TARGETS — every surface that can be reported
// -----------------------------------------------------------------------------
// Each surface has its own quarantine threshold because risk profiles differ.
// `auto_hide` means "hide from public view on first report pending review"
// — only set for high-abuse surfaces (balloons).
export const REPORTABLE = {
  post: { quarantine_threshold: 3, auto_hide: false, label: 'Post' },
  comment: { quarantine_threshold: 2, auto_hide: false, label: 'Comment' },
  inbox_drawing: { quarantine_threshold: 2, auto_hide: false, label: 'Drawing' },
  inbox_comment: { quarantine_threshold: 2, auto_hide: false, label: 'Drawing comment' },
  balloon: { quarantine_threshold: 1, auto_hide: true, label: 'Balloon' },
  dm_message: { quarantine_threshold: 999, auto_hide: false, label: 'Message' },  // never auto-acts; manual only
  lobby_message: { quarantine_threshold: 2, auto_hide: false, label: 'Lobby message' },
  lobby_drawing: { quarantine_threshold: 2, auto_hide: false, label: 'Lobby drawing' },
  user: { quarantine_threshold: 5, auto_hide: false, label: 'User' }
} as const;

export type ReportableType = keyof typeof REPORTABLE;

// -----------------------------------------------------------------------------
// STRIKE LADDER — what happens at each level
// -----------------------------------------------------------------------------
// Strikes decay after STRIKE_DECAY_DAYS. The user's "current level" is the
// count of non-decayed upheld strikes. Each level lists the capabilities it
// blocks; the gate middleware unions all blocks for the active level.
//
// Tone note for the frontend: these labels are what the user sees. Keep them
// honest but not punishing — they're meant to inform, not shame.
export const STRIKE_LADDER = [
  {
    level: 0,
    name: 'Good Standing',
    description: 'All features unlocked. Keep sketching!',
    blocks: [] as Capability[],
    duration_days: null
  },
  {
    level: 1,
    name: 'First Warning',
    description: 'We removed a piece of content. Please review our guidelines — no restrictions yet.',
    blocks: [] as Capability[],
    duration_days: 14   // warning visible for 14 days, but no actual block
  },
  {
    level: 2,
    name: 'Balloon Pause',
    description: 'Your balloon privileges are paused for 7 days. You can still post, chat, and draw with mates.',
    blocks: [Capability.SEND_BALLOON, Capability.RECEIVE_BALLOON] as Capability[],
    duration_days: 7
  },
  {
    level: 3,
    name: 'Public Pause',
    description: 'Public posting and balloons are paused for 30 days. You can still chat with existing mates.',
    blocks: [
      Capability.CREATE_POST,
      Capability.COMMENT_ON_POST,
      Capability.SEND_BALLOON,
      Capability.RECEIVE_BALLOON,
      Capability.JOIN_PUBLIC_LOBBY,
      Capability.CREATE_LOBBY,
      Capability.FOLLOW_USER,
      Capability.COMMENT_ON_INBOX
    ] as Capability[],
    duration_days: 30
  },
  {
    level: 4,
    name: 'Account Under Review',
    description: 'Most features are paused while we review your account. Contact support to appeal.',
    blocks: [
      Capability.CREATE_POST,
      Capability.COMMENT_ON_POST,
      Capability.SEND_BALLOON,
      Capability.RECEIVE_BALLOON,
      Capability.SEND_INBOX_DRAWING,
      Capability.SEND_MATE_REQUEST,
      Capability.JOIN_PUBLIC_LOBBY,
      Capability.CREATE_LOBBY,
      Capability.SEND_LOBBY_MESSAGE,
      Capability.DRAW_IN_LOBBY
    ] as Capability[],
    duration_days: null // until manually resolved
  },
  {
    level: 5,
    name: 'Suspended',
    description: 'Your account has been suspended. Contact support if you believe this is a mistake.',
    blocks: Object.values(Capability) as Capability[],  // everything
    duration_days: null
  }
] as const;

// -----------------------------------------------------------------------------
// DECAY & REPORTER TRUST KNOBS
// -----------------------------------------------------------------------------
export const POLICY_CONSTANTS = {
  STRIKE_DECAY_DAYS: 90,                // strikes older than this don't count
  REPORTER_TRUST_MIN: 0.2,              // weight floor for spam reporters
  REPORTER_TRUST_MAX: 1.5,              // weight ceiling for good-faith reporters
  REPORTER_TRUST_DEFAULT: 1.0,
  NEW_ACCOUNT_GRACE_DAYS: 7,            // new accounts have stricter thresholds
  NEW_ACCOUNT_THRESHOLD_MULTIPLIER: 0.5,// halve quarantine threshold for new accounts
  CONTENT_SNAPSHOT_RETENTION_DAYS: 30,
  REPORT_COOLDOWN_SECONDS: 60,          // anti-spam: one report per minute per reporter
  CROSS_CONVERSATION_DM_THRESHOLD: 3   // 3 DM reports from different people = author strike
} as const;

// -----------------------------------------------------------------------------
// HELPERS — used by gate middleware and frontend
// -----------------------------------------------------------------------------
export function getLevelConfig(level: number) {
  return STRIKE_LADDER[Math.min(level, STRIKE_LADDER.length - 1)];
}

export function isCapabilityBlocked(level: number, cap: Capability): boolean {
  return getLevelConfig(level).blocks.includes(cap);
}