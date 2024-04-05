export enum NotificationType {
  match = 'match',
  unmatch = 'unmatch',
  message = 'message',
  comment = 'comment',
  friend_request = 'friend_request'
}

export interface InboxItem {
  _id: string;
  followers: string[];
  original_followers: string[];
  drawing: string;
  thumbnail: string;
  image: string;
  date: Date;
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
  date: Date;
}

export interface NotificationSubscription {
  token: string,
  logged_in: boolean,
  fingerprint: string,
  platform: string,
  model: string,
  os: string
}

export interface User {
  _id: string;
  auth_id: string;
  name: string;
  img: string;
  mates: Mate[];
  inbox: string[];
  stickers: string[];
  emblems: string[];
  saved: Saved[];
  mate_requests_sent: string[];
  mate_requests_received: string[];
  subscriptions: NotificationSubscription[];
}

export interface Mate {
  _id: string;
  name: string;
  img: string;
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

export interface GetInboxItemsParams {
  _ids: string[];
}

export interface RemoveFromInboxParams {
  user_id: string;
  inbox_id: string;
}

export interface UnMatchParams {
  mate_id: string;
  name: string;
  _id: string;
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

export interface DeleteStickerParams {
  user_id: string;
  sticker_url: string;
}

export interface SendMateRequestParams {
  sender: string;
  sender_name: string;
  receiver: string;
}

export interface DeleteEmblemParams {
  user_id: string;
  emblem_url: string;
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

export interface CreateStickerParams {
  _id: string;
  img: any;
}

export interface CreateEmblemParams {
  _id: string;
  img: any;
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

export interface SeeInboxParams {
  inbox_id: string;
  user_id: string;
}


export interface Saved {
  drawing: string;
  img: string;
}

export interface GetInboxRes {
  inboxItems: InboxItem[],
  userInfo: Mate[]
}

export interface RegisterNotificationParams {
  user_id: string,
  subscription: NotificationSubscription
}

export interface UnRegisterNotificationParams {
  user_id: string,
  fingerprint: string
}

export interface OnLoginEventParams {
  user_id: string
  fingerprint: string
  loggedIn: boolean
}


export type Res<T> = T | undefined;

export interface API {

  getUser(params: GetUserParams): Promise<Res<GetUserRes>>;

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

export enum ENDPOINTS {
  user = '/user',
  partial_users = '/partial_users',
  subscribe = '/subscribe',
  unsubscribe = '/unsubscribe',
  inbox = '/inbox',
  sticker = '/sticker',
  emblem = '/emblem',
  saved = '/saved',
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
}
