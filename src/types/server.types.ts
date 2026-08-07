export enum NotificationType {
	// Current
	balloon_match = "balloon_match",
	drawing_received = "drawing_received",
	lobby_invitation = "lobby_invitation",
	dm_message = "dm_message",
	moderation_strike = "moderation_strike",
	moderation_lifted = "moderation_lifted",
	moderation_content = "moderation_content",
	mate_request = "mate_request",
	request_accepted = "request_accepted",

	// Legacy — remove with legacy config
	match = "match",
	unmatch = "unmatch",
	message = "message",
	comment = "comment",
	friend_request = "friend_request",
	balloon = "balloon",
}

export enum ENDPOINTS {
	user = "/user",
	partial_users = "/partial_users",
	subscribe = "/subscribe",
	unsubscribe = "/unsubscribe",
	inbox = "/inbox",
	sticker = "/sticker",
	emblem = "/emblem",
	saved = "/saved",
	balloon = "/balloon",
	report = "/report",
}

export enum SOCKET_ENDPONTS {
	match = "match",
	unmatch = "unmatch",
	login = "login",
	send = "send",
	disconnect = "disconnect",
	comment = "comment",
	comment_v2 = "comment_v2",
	mate_request = "mate_request",
	cancel_mate_request = "cancel_mate_request",
	refuse_mate_request = "refuse_mate_request",
	accept_balloon = "accept_balloon",
	refuse_balloon = "refuse_balloon",
	cancel_balloon = "cancel-balloon ",
	match_balloon = "match-balloon",
	balloon_match_expired = "balloon_match_expired",
	balloon_expired = "balloon_expired ",
	receive_new_balloon = "receive_new_balloon",
	receive_new_balloon_v3 = "receive_new_balloon_v3",
	balloon_missed = "balloon_missed",
	v2_accept_balloon = "v2_accept_balloon",
	v3_accept_balloon = "v3_accept_balloon",
	v2_refuse_balloon = "v2_refuse_balloon",
	v2_cancel_balloon = "v2_cancel_balloon",
	balloon_check = "balloon_check",
	friend_invitation = "friend-invitation",
	moderation_strike = "moderation:strike",
	moderation_restriction_lifted = "moderation:restriction_lifted",
	moderation_content = "moderation:content",
}

// --- SHARED TYPES ---

export type Res<T> = T | undefined | null;

export type ChatStatus =
	| "none"
	| "pending_invite"
	| "temporary"
	| "expired"
	| "pending_mate"
	| "mate"
	| "blocked";

// Standardized ConversationStatus to match ChatStatus for UI consistency
export type ConversationStatus = ChatStatus;

export interface Mate {
	_id: string;
	name: string;
	img: string;
	last_seen_version?: string;
	customization?: Partial<UserCustomization>;
	chat_status?: ChatStatus;
}

export interface Saved {
	drawing: string;
	img: string;
}

// =============================================================================
// MODERATION
// =============================================================================
// These types are also re-exported from /config/moderation.policy.ts so the
// frontend can import either location. The policy file is the source of truth
// for the values; this file is the source of truth for the type shapes.

export type ContentModerationStatus = "active" | "under_review" | "removed";

export interface ContentModerationMeta {
	quarantined_at?: string;
	removed_at?: string;
	last_report_at?: string;
	last_report_reason?: string;
}

export type ReportReason =
	| "minor_safety"
	| "nsfw"
	| "violence"
	| "harassment"
	| "hate_speech"
	| "spam"
	| "impersonation"
	| "other";

export type ReportableType =
	| "post"
	| "comment"
	| "user"
	| "balloon"
	| "dm_message"
	| "inbox_drawing"
	| "inbox_comment"
	| "lobby_message"
	| "lobby_drawing";

export type ReportStatus = "pending" | "auto_actioned" | "upheld" | "dismissed";

// Mirrors the Capability enum in moderation.policy.ts. Kept as a string union
// here so this file has no imports.
export type Capability =
	| "CREATE_POST"
	| "COMMENT_ON_POST"
	| "REACT_TO_POST"
	| "SEND_INBOX_DRAWING"
	| "COMMENT_ON_INBOX"
	| "SEND_BALLOON"
	| "RECEIVE_BALLOON"
	| "SEND_DM"
	| "SEND_MATE_REQUEST"
	| "CREATE_LOBBY"
	| "JOIN_PUBLIC_LOBBY"
	| "SEND_LOBBY_MESSAGE"
	| "DRAW_IN_LOBBY"
	| "CHANGE_NAME"
	| "CHANGE_PROFILE_IMG"
	| "REPORT_CONTENT";

export interface UserRestriction {
	level: number;
	reason?: ReportReason;
	applied_at?: string;
	expires_at?: string;
}

export interface UserStrikeSummary {
	active_strikes: number;
	total_strikes: number;
	last_strike_at?: string;
}

export interface ModerationStrikePayload {
	level: number;
	name: string;
	description: string;
	reason: ReportReason;
	expires_at?: string;
	blocked_capabilities: Capability[]; // Kept for UI rendering optimization
}

export interface UserStandingData {
	level: number;
	name: string;
	description: string;
	restriction:
		| (UserRestriction & { blocked_capabilities: Capability[] })
		| null;
	summary: UserStrikeSummary;
	history: Array<{
		action_type: string;
		level?: number;
		reason?: ReportReason;
		created_at: string;
		expires_at?: string;
	}>;
}

// 403 response body from requireCapability — frontend catches and shows sheet
export interface CapabilityBlockedError {
	error: "capability_blocked";
	capability: Capability;
	restriction: {
		level: number;
		name: string;
		description: string;
		reason?: ReportReason;
		expires_at?: string;
		applied_at?: string;
	};
}

// =============================================================================
// USER & PROFILE
// =============================================================================

/**
 * Google Play Families policy: peer-to-peer features on an under-age account
 * are OFF until a parent/guardian passes the adult gate and switches them on
 * individually. Absent/false always means "not allowed" — never default a
 * missing flag to true.
 */
export interface ParentalControls {
	/** ISO date an adult last opened the controls through the adult gate. */
	reviewed_at?: string;
	/** Adding mates by QR / personal link (exchanges name + avatar). */
	allow_mate_add?: boolean;
	/** 1:1 chat with mates already added. */
	allow_mate_chat?: boolean;
	/** Sending drawings to mates. */
	allow_mate_send?: boolean;
	/** Shared drawing rooms with mates. */
	allow_rooms?: boolean;
	/** ISO date the child last acknowledged the online-safety reminder. */
	safety_ack_at?: string;
}

export interface User {
	is_admin?: boolean;
	_id: string;
	auth_id: string;
	name: string;
	description?: string;
	img: string;
	subscription_tier?: string;
	/** Home feed visibility: 'off' (hidden), 'mates' (connections only) or
	    'open' (connections + global discovery). Defaults to 'open'. */
	feed_level?: "off" | "mates" | "open";
	stats: UserStats;

	// Moderation — both optional so legacy clients don't crash if absent.
	// Auth middleware always populates these from sub-schema defaults.
	restriction?: UserRestriction;
	strike_summary?: UserStrikeSummary;

	// UI / Inventory
	stickers: string[];
	emblems: string[];
	saved: Saved[];
	customization: UserCustomization;
	chat_customization?: ChatCustomization;

	// System / Auth
	subscriptions: NotificationSubscription[];
	date_of_birth?: string;
	/** Adult-managed switches for under-age accounts. See ParentalControls. */
	parental?: ParentalControls;
	last_seen_version?: string;
	/** Private IANA timezone used for local-time server scheduling. */
	timezone?: string;
	last_name_change?: string;
	migration_version: number;

	// Features
	balloon?: {
		sent?: string;
		disabled?: boolean;
		last_received_at?: string;
		received?: string; // @deprecated
	};

	// @deprecated - Now managed via Relationship collection
	mates: Mate[];
	inbox: string[];
	mate_requests_sent: string[];
	mate_requests_received: string[];
	engagement_metadata?: {
		last_thought_prompt_at?: string;
		total_thought_prompts_shown?: number;
		tasks_completed_since_last_prompt?: number;
		feedback_opted_out?: boolean;
	};
	inventory: string[];
}

export interface UserCustomization {
	themeId: string;
	fontId: string;
	fontEffectId: string;
	worldId: string;
	decorationId: string;
	effectId: string;
	titleId: string;
	signaturePath?: string;
	signatureViewBox?: string;
	backgroundSketchPath?: string;
	backgroundSketchViewBox?: string;
}

export type ChatCustomization = Pick<
	UserCustomization,
	"themeId" | "fontId" | "fontEffectId"
> & {
	backgroundImageUrl?: string;
	backgroundImageOpacity?: number;
};

export interface UserStats {
	posts: number;
	followers: number;
	following: number;
	mates?: number;
}

export interface UserRelationship {
	isFollowing: boolean;
	areFollowingMe: boolean;
}

export interface NetworkUser extends Mate {
	description?: string;
	stats?: UserStats;
	relationship?: UserRelationship;
	chat_status?: ChatStatus;
	expires_at?: string;
	relationship_id?: string;
	last_interaction_at?: string;
}

export interface UserProfileData {
	profile: {
		_id: string;
		name: string;
		description: string;
		img: string;
		stats: UserStats;
		relationship: UserRelationship & {
			chatStatus: ChatStatus;
		};
	};
	posts: Array<{
		_id: string;
		thumbnail_url: string;
		aspect_ratio: number;
	}>;
}

// =============================================================================
// SOCIAL CONTENT (POSTS, COMMENTS, INBOX)
// =============================================================================

export interface BasePost {
	_id: string;
	author_id: string;
	description?: string;
	drawing_url: string;
	image_url: string;
	thumbnail_url: string;
	aspect_ratio: number;
	comment_count: number;
	reports_count: number;
	enable_comments: boolean;
	enable_remix: boolean;
	views: number;
	total_reactions: number;
	status: ContentModerationStatus;
	moderation?: ContentModerationMeta;
	reaction_counts: Record<string, number>;
}

export type FeedPost = Omit<BasePost, "createdAt" | "updatedAt"> & {
	author: {
		_id: string;
		name: string;
		img: string;
		customization?: Partial<UserCustomization>;
	};
	user_reaction: string | null;
	comments: any[];
	createdAt: string;
	updatedAt: string;
	commentsLoaded?: boolean;
};

export interface InboxItem {
	_id: string;
	followers: string[];
	original_followers: string[];
	drawing: string;
	thumbnail: string;
	image: string;
	date: string;
	sender: string;
	reply?: InboxItem;
	comments: Comment[]; // @deprecated
	comment_count: number;
	aspect_ratio: number;
	seen_by: string[];
	comments_seen_by: string[];

	// Moderation — confirmed reports remove the item from ALL recipients,
	// not just the reporter's view. Filter in inbox queries.
	status: ContentModerationStatus;
	reports_count: number;
	moderation?: ContentModerationMeta;
}

export interface InboxComment {
	_id: string;
	inbox_id: string;
	sender: string;
	message: string;
	date: string;
	status: "active" | "removed";
	reports_count: number;
}

export interface Comment {
	sender: string;
	message: string;
	_id: string;
	date: string;
	status?: "active" | "removed";
	reports_count?: number;
}

export interface GetInboxCommentsRes {
	comments: Comment[];
	hasMore: boolean;
}

export interface BasePostComment {
	_id: string;
	post_id: string;
	author_id: string;
	message: string;
	createdAt: string;
	updatedAt: string;

	// Post-comment moderation — same convention as inbox comments
	status?: ContentModerationStatus;
	reports_count?: number;
}

export interface HydratedPostComment
	extends Omit<BasePostComment, "author_id"> {
	author: {
		_id: string;
		name: string;
		img: string;
	};
}

export interface BasePostReaction {
	_id: string;
	post_id: string;
	user_id: string;
	reaction_type: string;
}

// =============================================================================
// REPORT
// =============================================================================
// Replaces the legacy shape — supports all reportable surfaces and the full
// resolution lifecycle.

export interface Report {
	_id: string;
	reporter_id: string;
	target_id: string;
	target_type: ReportableType;
	target_author_id: string;
	reason: ReportReason;
	details?: string;
	status: ReportStatus;
	content_snapshot?: any;
	resolved_at?: string;
	resolved_by?: string;
	createdAt: string;
	updatedAt: string;
}

// Append-only audit log entry — visible in the Standing page history
export interface ModerationAction {
	_id: string;
	user_id: string;
	action_type:
		| "strike_applied"
		| "strike_decayed"
		| "restriction_applied"
		| "restriction_lifted"
		| "manual_suspension"
		| "appeal_granted"
		| "appeal_denied";
	level?: number;
	reason?: ReportReason;
	source_report_id?: string;
	expires_at?: string;
	blocked_capabilities?: Capability[];
	admin_id?: string;
	notes?: string;
	createdAt: string;
	updatedAt: string;
}

// =============================================================================
// BALLOONS
// =============================================================================

export type BalloonStatus = "pending" | "paired" | "accepted";

export interface Balloon {
	_id: string;
	sender: string;
	message: string;
	drawingJsonUrl: string;
	img: string;
	thumbnail: string;
	aspect_ratio: number;

	// Lifecycle status — pending, paired with another balloon, or accepted
	status: BalloonStatus;

	// Moderation status — separate field because lifecycle and moderation
	// change independently. Routing layer must check this is 'active' before
	// circulating a balloon to recipients.
	moderation_status: ContentModerationStatus;
	reports_count: number;
	moderation?: ContentModerationMeta;

	createdAt: string;
	matchedAt?: string;
	lastActivityAt: string;
	pairedUser?: string;
	pairedBalloon?: string;
	cancelledBalloons: string[];
	version?: number;
	rejected_by: string[];
}

// =============================================================================
// CHAT & RELATIONSHIPS
// =============================================================================

export interface BaseMessage {
	_id: string;
	conversation_id: string;
	sender_id: string;
	content: string;
	is_invite: boolean;
	createdAt: string;
	updatedAt: string;
	status?: string;

	// Message kind. Default 'user'; 'system' for things like balloon matches.
	type?: "user" | "system";
	system_kind?: "balloon_match";
	system_payload?: {
		acceptor_id?: string;
		acceptor_name?: string;
		sender_id?: string;
		balloon_id?: string;
		thumbnail?: string;
	};

	moderation_status?: "active" | "removed";
	reports_count?: number;
	shared_post_id?: string;
	shared_inbox_item_id?: string;
}

export interface BaseConversation {
	_id: string;
	participants: string[];
	last_message?: string;
	unread_counts: Record<string, number>;
	createdAt: string;
	updatedAt: string;
	deleted_at?: string;
}

export interface PopulatedConversation
	extends Omit<BaseConversation, "participants" | "last_message"> {
	participants: Mate[];
	last_message?: BaseMessage;

	// INJECTED FROM RELATIONSHIP COLLECTION
	status: ChatStatus;
	chat_status?: ChatStatus; // Keeping this for NetworkUser compatibility
	initiator_id?: string;
	trial_expires_at?: string;
	cooldown_until?: string;
	relationship_id?: string;

	// Anti-pestering state, resolved server-side FOR THE CURRENT VIEWER — never
	// the partner's. `locked` means the partner has declined enough times that
	// no further request is possible in this relationship; `cooldown_until` is
	// the escalating wait after a decline (or the short one after a cancel).
	mate_request_locked?: boolean;
	mate_request_cooldown_until?: string | null;
}

export interface Relationship {
	_id: string;
	users: [string, string]; // Sorted alphabetically
	chat_status: ChatStatus;
	conversation_id?: string;
	action_user_id?: string;
	expires_at?: string; // ISO String
	cooldown_until?: string; // ISO String
	follows: {
		follower: string;
		followed: string;
	}[];
	createdAt: string;
	updatedAt: string;
	deleted_at?: string;
}

export interface BaseRelationship {
	_id: string;
	users: [string, string];
	chat_status: ChatStatus;
	conversation_id?: string;
	action_user_id?: string;
	blocked_by?: string;
	expires_at?: string;
	cooldown_until?: string;
	follows: {
		follower: string;
		followed: string;
	}[];
	createdAt: string;
	updatedAt: string;
	deleted_at?: string;
}

// =============================================================================
// API PARAMETERS & RESPONSES
// =============================================================================

export interface NotificationSubscription {
	token: string;
	logged_in: boolean;
	fingerprint: string;
	platform: string;
	model: string;
	os: string;
	updated_at?: string;
}

export interface GetUserParams {
	_id?: string;
	auth_id: string;
}

export interface GetUserRes {
	user: User;
	new_account: boolean;
	minimum_supported_version: string;
	minimum_online_version: string;
}

export interface UpdateUserParams extends Partial<User> {
	_id: string;
}

export interface UpdateProfilePayload {
	name?: string;
	description?: string;
	customization?: UserCustomization;
	chat_customization?: ChatCustomization;
	subscription_tier?: string;
}

export interface ChangeUserNameParams {
	_id: string;
	name: string;
}

export interface UploadProfileImgParams {
	_id: string;
	img: any;
	previousImage?: string;
}

export interface DeleteProfileImgParams {
	_id: string;
	stock_img: string;
}

export interface GetInboxItemsParams {
	_ids: string[];
}

export interface GetInboxRes {
	inboxItems: InboxItem[];
	userInfo: Mate[];
}

export interface SeeInboxParams {
	inbox_id: string;
	user_id: string;
}

export interface RemoveFromInboxParams {
	user_id: string;
	inbox_id: string;
}

export interface CreateBalloonPostParams {
	sender: string;
	message: string;
	drawing: string;
	img: any;
	aspect_ratio: number;
	version?: number;
}

export interface CreateBalloonPostRes {
	balloon: Balloon;
}

export interface CreateStickerParams {
	_id: string;
	img: any;
}

export interface DeleteStickerParams {
	user_id: string;
	sticker_url: string;
}

export interface CreateEmblemParams {
	_id: string;
	img: any;
}

export interface DeleteEmblemParams {
	user_id: string;
	emblem_url: string;
}

export interface CreateSavedParams {
	_id: string;
	img: any;
	drawing: any;
}

export interface DeleteSavedParams {
	user_id: string;
	drawing_url: string;
	img_url: string;
}

export interface RegisterNotificationParams {
	user_id: string;
	subscription: NotificationSubscription;
}

export interface UnRegisterNotificationParams {
	user_id: string;
	fingerprint: string;
}

export interface OnLoginEventParams {
	user_id: string;
	fingerprint: string;
	loggedIn: boolean;
}

export interface SearchMateParams {
	mateName: string;
	user_id: string;
}

export interface SocketLoginParams {
	_id: string;
}

export interface MatchParams {
	_id: string;
	mate_id: string;
}

export interface MatchRes {
	mate?: Mate;
	error?: string;
}

export interface UnMatchParams {
	mate_id: string;
	name: string;
	_id: string;
}

export interface SendParams {
	_id: string;
	name: string;
	followers: string[];
	drawing: string;
	img: any;
	aspect_ratio: number;
}

export interface SendRes {
	inboxItem: InboxItem;
}

export interface CommentParams {
	inbox_id: string;
	sender: string;
	message: string;
	followers: string[];
	name: string;
	img: string;
}

export interface CommentRes {
	comment: InboxComment;
	inbox_item_id: string;
}

export interface SendMateRequestParams {
	sender: string;
	sender_name: string;
	receiver: string;
}

export interface AcceptBalloonParams {
	user_id: string;
	balloon_id: string;
	sender: string;
}

export interface AcceptBalloonRes {
	isMatch: boolean;
	acceptor: string;
}

export interface RejectBalloonRes {
	refuser: string;
}

export interface CancelBalloonParams {
	user_id: string;
	balloon_id: string;
}

export interface MatchBalloonRes {
	received_balloon: Balloon;
}

// --- REPORT API PARAMS ---

export interface SubmitReportParams {
	target_id: string;
	target_type: ReportableType;
	reason: ReportReason;
	details?: string;
}

export interface SubmitReportRes {
	success: boolean;
	alreadyReported?: boolean;
	message?: string;
}

export type SubscriptionTier = "free" | "pro";

// todo rename
export interface DailyQuota {
	balloons_per_day: number;
	posts_per_day: number;
}

export interface QuotaState {
	used: number;
	/** `null` = unlimited. Treat null as "no cap", never as zero. */
	limit: number | null;
	remaining: number;
	reset_at?: string;
}

export interface QuotaSummary {
	tier: string;
	balloons: QuotaState;
	posts: QuotaState;
	/** Deprecated server compatibility field; current UI does not consume it. */
	mates?: QuotaState;
}

// =============================================================================
// NOTIFICATIONS
// =============================================================================

export type NotificationKind =
	| "post_reaction"
	| "post_comment"
	| "inbox_drawing"
	| "inbox_comment"
	| "dm_message"
	| "follow"
	| "moderation_strike"
	| "moderation_lifted"
	// Content lifecycle notice — quarantined / removed / restored, discriminated
	// by payload.status. Mirrors NotificationKind on the server.
	| "moderation_content"
	| "lobby_invitation"
	| "announcement";

export type NotificationTargetType =
	| "post"
	| "inbox_item"
	| "comment"
	| "user"
	| "system";

export interface NotificationActor {
	_id: string;
	name: string;
	img: string;
}

export interface NotificationTargetPreview {
	thumbnail?: string;
	text?: string;
}

export interface Notification {
	_id: string;
	recipient_id: string;
	type: NotificationKind;

	// Aggregation key — entries sharing this within the merge window get merged.
	// Absent = never aggregate (one entry per event).
	aggregation_key?: string;

	// Denormalized actors so the feed renders without N+1 user lookups.
	// Capped at MAX_STORED_ACTORS (3) — actor_count holds the true total.
	actors: NotificationActor[];
	actor_count: number;

	// What the notification points to when tapped
	target_type?: NotificationTargetType;
	target_id?: string;
	target_preview?: NotificationTargetPreview;

	// State — split intentionally:
	//   seen = appeared in the bell (bulk-cleared when opening the feed)
	//   read = user actually tapped this specific entry
	read: boolean;
	seen: boolean;

	// Free-form payload for moderation/announcement types that need
	// structured data beyond the standard fields (level, expires_at, etc.)
	payload?: any;

	createdAt: string;
	updatedAt: string;
}

export interface BaseSavedDrawing {
	user_id: string;
	drawing: string;
	img: string;
}
