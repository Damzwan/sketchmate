// --- ENUMS & CONSTANTS ---

export enum NotificationType {
  match = 'match',
  unmatch = 'unmatch',
  message = 'message',
  comment = 'comment',
  friend_request = 'friend_request',
  balloon = 'balloon',
  lobby_invitation = 'lobby_invitation',
}

export enum ENDPOINTS {
  user = '/user',
  partial_users = '/partial_users',
  subscribe = '/subscribe',
  unsubscribe = '/unsubscribe',
  inbox = '/inbox',
  sticker = '/sticker',
  emblem = '/emblem',
  saved = '/saved',
  balloon = '/balloon',
}

export enum SOCKET_ENDPONTS {
  match = 'match',
  unmatch = 'unmatch',
  login = 'login',
  send = 'send',
  disconnect = 'disconnect',
  comment = 'comment',
  mate_request = 'mate_request',
  cancel_mate_request = 'cancel_mate_request',
  refuse_mate_request = 'refuse_mate_request',
  accept_balloon = 'accept_balloon',
  refuse_balloon = 'refuse_balloon',
  cancel_balloon = 'cancel-balloon ',
  match_balloon = 'match-balloon',
  balloon_match_expired = 'balloon_match_expired',
  balloon_expired = 'balloon_expired ',
  receive_new_balloon = 'receive_new_balloon',
  balloon_missed = 'balloon_missed',
  v2_accept_balloon = 'v2_accept_balloon',
  v2_refuse_balloon = 'v2_refuse_balloon',
  v2_cancel_balloon = 'v2_cancel_balloon',
  balloon_check = 'balloon_check',
  friend_invitation = 'friend-invitation',
}

// --- SHARED TYPES ---

export type Res<T> = T | undefined | null;

export type ChatStatus = 'none' | 'pending_invite' | 'temporary' | 'expired' | 'pending_mate' | 'mate' | 'blocked';

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

// --- USER & PROFILE ---

export interface User {
  _id: string;
  auth_id: string;
  name: string;
  description?: string;
  img: string;
  subscription_tier?: string;
  stats: UserStats

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
  titleId?: string;
  fontFamily?: string;
  fontEffect?: string;
  cardBg?: string;
  cardBgColor?: string;
  nameColor?: string;
  descColor?: string;
  avatarBorderColor?: string;
  cardBorderColor?: string;
  signatureColor?: string;
  signaturePath?: string;
  signatureViewBox?: string;
  unlocked_items?: string[];
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

// --- SOCIAL CONTENT (POSTS, COMMENTS, INBOX) ---

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
  status: 'active' | 'under_review' | 'removed';
  reaction_counts: Record<string, number>;
}

export type FeedPost = Omit<BasePost, 'createdAt' | 'updatedAt'> & {
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
}

export interface Comment {
  sender: string;
  message: string;
  _id: string;
  date: string;
}

export interface BasePostComment {
  _id: string;
  post_id: string;
  author_id: string;
  message: string;
  createdAt: string;
  updatedAt: string;
}

export interface HydratedPostComment extends Omit<BasePostComment, 'author_id'> {
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

export interface Report {
  _id: string;
  reporter_id: string;
  target_id: string;
  target_type: 'post' | 'comment' | 'user';
  reason: 'spam' | 'nsfw' | 'harassment';
  created_at: string;
}

// --- BALLOONS ---

export type BalloonStatus = 'pending' | 'paired' | 'accepted';

export interface Balloon {
  _id: string;
  sender: string;
  message: string;
  drawingJsonUrl: string;
  img: string;
  thumbnail: string;
  aspect_ratio: number;
  status: BalloonStatus;
  createdAt: string;
  matchedAt?: string;
  lastActivityAt: string;
  pairedUser?: string;
  pairedBalloon?: string;
  cancelledBalloons: string[];
  version?: number;
  rejected_by: string[];
}

// --- CHAT & RELATIONSHIPS ---

export interface BaseMessage {
  _id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_invite: boolean;
  createdAt: string;
  updatedAt: string;
  status?: string;
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

export interface PopulatedConversation extends Omit<BaseConversation, 'participants' | 'last_message'> {
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

// --- API PARAMETERS & RESPONSES ---

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

// --- INTERFACES ---

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

  createBalloon(params: CreateBalloonPostParams): Promise<Res<CreateBalloonPostRes>>;

  getBalloon(params: { balloonId: string }): Promise<Res<Balloon>>;
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