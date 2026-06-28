// src/config/relationship.config.ts
//
// Single source of truth for the "becoming Mates" journey:
//
//   1. Invite   — a sketch request was sent / received      (status: pending_invite)
//   2. Trial    — 24-hour temporary connection              (status: temporary)
//   3. Mates    — permanent, requested then accepted        (status: pending_mate → mate)
//
// Every chat surface (list item, header, banner) reads its labels, hints and
// accent from here so the wording and styling stay identical across the app.

import { mdiSendOutline, mdiClockOutline, mdiHeart } from "@mdi/js";

export type RelationshipKind =
  | "live_invite" // live "draw together right now" invite (not part of the journey)
  | "incoming_invite"
  | "outgoing_invite"
  | "trial"
  | "trial_expired"
  | "incoming_mate"
  | "outgoing_mate"
  | "mate"
  | "active" // any established conversation with no special state
  | "expired";

export type RelationshipAccent =
  | "secondary"
  | "amber"
  | "cyan"
  | "neutral"
  | "danger";

export interface RelationshipState {
  kind: RelationshipKind;
  /** Position on the Invite → Trial → Mates journey (1-3). 0 = not on the journey. */
  step: 0 | 1 | 2 | 3;
  /** Short status chip text, e.g. "Trial". */
  label: string;
  /** One-line, plain-language explanation of what's happening / what to do next. */
  hint: string;
  /** Does this require the *current* user to take an action? */
  actionable: boolean;
  accent: RelationshipAccent;
}

/** The three visible stops on the journey, in order. Used to render the progress rail. */
export const JOURNEY_STEPS = [
  { label: "Invite", icon: mdiSendOutline },
  { label: "Trial", icon: mdiClockOutline },
  { label: "Mates", icon: mdiHeart },
] as const;

interface ResolveArgs {
  status?: string;
  initiatorId?: string;
  currentUserId?: string;
  trialExpiresAt?: string | Date | null;
}

const trialHasExpired = (trialExpiresAt?: string | Date | null) =>
  !!trialExpiresAt && new Date(trialExpiresAt).getTime() < Date.now();

/**
 * Resolve a conversation's status + initiator into a rich, display-ready state.
 * Pure and store-free so it can be unit-tested and reused anywhere.
 */
export function resolveRelationship({
                                      status,
                                      initiatorId,
                                      currentUserId,
                                      trialExpiresAt,
                                    }: ResolveArgs): RelationshipState {
  const mine = !!initiatorId && !!currentUserId && initiatorId === currentUserId;

  switch (status) {
    case "live_invite":
      return {
        kind: "live_invite",
        step: 0,
        label: "Live",
        hint: "Tap to jump into their canvas",
        actionable: true,
        accent: "secondary",
      };

    case "pending":
    case "pending_invite":
      return mine
        ? {
          kind: "outgoing_invite",
          step: 1,
          label: "Invite sent",
          hint: "Waiting for them to accept",
          actionable: false,
          accent: "neutral",
        }
        : {
          kind: "incoming_invite",
          step: 1,
          label: "Invited you",
          hint: "Accept to start a 24-hour trial",
          actionable: true,
          accent: "secondary",
        };

    case "temporary":
      return trialHasExpired(trialExpiresAt)
        ? {
          kind: "trial_expired",
          step: 2,
          label: "Trial ended",
          hint: "Become Mates to keep sketching",
          actionable: true,
          accent: "amber",
        }
        : {
          kind: "trial",
          step: 2,
          label: "Trial",
          hint: "24-hour trial — see if you vibe",
          actionable: false,
          accent: "secondary",
        };

    case "pending_mate":
      return mine
        ? {
          kind: "outgoing_mate",
          step: 3,
          label: "Request sent",
          hint: "Waiting for them to accept",
          actionable: false,
          accent: "neutral",
        }
        : {
          kind: "incoming_mate",
          step: 3,
          label: "Wants to be Mates",
          hint: "Accept to become permanent Mates",
          actionable: true,
          accent: "secondary",
        };

    case "expired":
      return {
        kind: "expired",
        step: 0,
        label: "Ended",
        hint: "This connection has ended",
        actionable: false,
        accent: "neutral",
      };

    default:
      return {
        kind: status === "mate" ? "mate" : "active",
        step: 3,
        label: "Mates",
        hint: "",
        actionable: false,
        accent: "secondary",
      };
  }
}

/** Tailwind class bundles per accent, so components don't each invent their own. */
export const RELATIONSHIP_ACCENT: Record<
  RelationshipAccent,
  {
    chip: string;
    dot: string;
    glow: string;
    text: string;
    solid: string;
    ring: string;
  }
> = {
  secondary: {
    chip: "bg-secondary/10 text-secondary",
    dot: "bg-secondary",
    glow: "bg-secondary/15",
    text: "text-secondary",
    solid: "bg-secondary text-white",
    ring: "ring-secondary/20",
  },
  amber: {
    chip: "bg-amber-400/15 text-amber-700",
    dot: "bg-amber-500",
    glow: "bg-amber-400/20",
    text: "text-amber-700",
    solid: "bg-amber-500 text-white",
    ring: "ring-amber-400/25",
  },
  cyan: {
    chip: "bg-cyan-400/15 text-cyan-700",
    dot: "bg-cyan-500",
    glow: "bg-cyan-400/20",
    text: "text-cyan-700",
    solid: "bg-cyan-500 text-white",
    ring: "ring-cyan-400/25",
  },
  neutral: {
    chip: "bg-black/5 text-black/40",
    dot: "bg-black/30",
    glow: "bg-black/5",
    text: "text-black/40",
    solid: "bg-black/40 text-white",
    ring: "ring-black/10",
  },
  danger: {
    chip: "bg-red-500/10 text-red-500",
    dot: "bg-red-500",
    glow: "bg-red-500/15",
    text: "text-red-500",
    solid: "bg-red-500 text-white",
    ring: "ring-red-500/20",
  },
};