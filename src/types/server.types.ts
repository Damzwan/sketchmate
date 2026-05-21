// --- ENUMS & CONSTANTS ---

export enum NotificationType {
	match = "match",
	unmatch = "unmatch",
	message = "message",
	comment = "comment",
	friend_request = "friend_request",
	balloon = "balloon",
	lobby_invitation = "lobby_invitation",
	moderation_strike = "moderation_strike",
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
	balloon_missed = "balloon_missed",
	v2_accept_balloon = "v2_accept_balloon",
	v2_refuse_balloon = "v2_refuse_balloon",
	v2_cancel_balloon = "v2_cancel_balloon",
	balloon_check = "balloon_check",
	friend_invitation = "friend-invitation",
	moderation_strike = "moderation:strike",
	moderation_restriction_lifted = "moderation:restriction_lifted",
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
	blocked_capabilities: Capability[];
}

export interface UserStrikeSummary {
	active_strikes: number;
	total_strikes: number;
	last_strike_at?: string;
}

// Payload emitted by the moderation:strike socket event — drives the
// restriction modal on the frontend.
export interface ModerationStrikePayload {
	level: number;
	name: string;
	description: string;
	reason: ReportReason;
	expires_at?: string;
	blocked_capabilities: Capability[];
}

// Returned by GET /report/standing — drives the "Your Standing" page
export interface UserStandingData {
	level: number;
	name: string;
	description: string;
	restriction: UserRestriction | null;
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

export interface User {
	_id: string;
	auth_id: string;
	name: string;
	description?: string;
	img: string;
	subscription_tier?: string;
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

	// System / Auth
	subscriptions: NotificationSubscription[];
	date_of_birth?: string;
	last_seen_version?: string;
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
}

export interface UserCustomization {
	themeId: string;
	fontId: string;
	fontEffectId: string;
	decorationId: string;
	effectId: string;
	titleId: string;
	signaturePath?: string;
	signatureViewBox?: string;
}

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
	status: ContentModerationStatus;
	moderation?: ContentModerationMeta;
	reaction_counts: Record<string, number>;
}

export type FeedPost = Omit<BasePost, "createdAt" | "updatedAt"> & {
	author: { _id: string; name: string; img: string };
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
	comments: Comment[];
	aspect_ratio: number;
	seen_by: string[];
	comments_seen_by: string[];

	// Moderation — confirmed reports remove the item from ALL recipients,
	// not just the reporter's view. Filter in inbox queries.
	status: ContentModerationStatus;
	reports_count: number;
	moderation?: ContentModerationMeta;
}

export interface Comment {
	sender: string;
	message: string;
	_id: string;
	date: string;

	// Inbox-comment moderation — removed comments render as "[removed]"
	// client-side so threading stays intact.
	status?: "active" | "removed";
	reports_count?: number;
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

	// DM-message moderation — soft delete on uphold, preserves conversation flow
	moderation_status?: "active" | "removed";
	reports_count?: number;
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
}

export interface GetUserParams {
	_id?: string;
	auth_id: string;
}

export interface GetUserRes {
	user: User;
	new_account: boolean;
	minimum_supported_version: string;
}

export interface UpdateUserParams extends Partial<User> {
	_id: string;
}

export interface UpdateProfilePayload {
	name?: string;
	description?: string;
	customization?: UserCustomization;
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
}

export interface CommentRes {
	comment: Comment;
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

// =============================================================================
// INTERFACES
// =============================================================================

export interface API {
	getUser(params: GetUserParams): Promise<Res<GetUserRes>>;

	updateUser(params: UpdateUserParams): Promise<Res<void>>;

	getPartialUsers(params: { _ids: string[] }): Promise<Res<Mate[]>>;

	subscribe(params: RegisterNotificationParams): Promise<Res<void>>;

	unsubscribe(params: UnRegisterNotificationParams): Promise<Res<void>>;

	getInbox(params: GetInboxItemsParams): Promise<GetInboxRes>;

	removeFromInbox(params: RemoveFromInboxParams): Promise<Res<void>>;

	changeUserName(params: ChangeUserNameParams): Promise<Res<void>>;

	uploadProfileImg(params: UploadProfileImgParams): Promise<Res<string>>;

	deleteProfileImg(params: DeleteProfileImgParams): Promise<void>;

	createSticker(params: CreateStickerParams): Promise<Res<string>>;

	createEmblem(params: CreateEmblemParams): Promise<Res<string>>;

	deleteSticker(params: DeleteStickerParams): Promise<void>;

	deleteEmblem(params: DeleteEmblemParams): Promise<void>;

	createSaved(params: CreateSavedParams): Promise<Res<Saved>>;

	deleteSaved(params: DeleteSavedParams): Promise<void>;

	seeInboxItem(params: SeeInboxParams): Promise<void>;

	onLoginEvent(params: OnLoginEventParams): Promise<void>;

	searchMate(params: SearchMateParams): Promise<Res<Mate[]>>;

	createBalloon(
		params: CreateBalloonPostParams,
	): Promise<Res<CreateBalloonPostRes>>;

	getBalloon(params: { balloonId: string }): Promise<Res<Balloon>>;

	submitReport(params: SubmitReportParams): Promise<Res<SubmitReportRes>>;

	getStanding(): Promise<Res<UserStandingData>>;
}

export interface SocketAPI {
	connect: () => Promise<void>;
	disconnect: () => Promise<void>;
	match: (params: MatchParams) => Promise<void>;
	send: (params: SendParams) => Promise<void>;

	unMatch(params: UnMatchParams): Promise<void>;

	comment(params: CommentParams): Promise<void>;

	login(params: SocketLoginParams): Promise<void>;

	sendMateRequest(params: SendMateRequestParams): Promise<void>;

	cancelSendMateRequest(params: SendMateRequestParams): Promise<void>;

	refuseSendMateRequest(params: SendMateRequestParams): Promise<void>;
}
