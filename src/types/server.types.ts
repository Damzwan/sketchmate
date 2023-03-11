import { PushSubscription } from 'web-push';

export enum NotificationType {
  match = 'match',
  unmatched = 'unmatched',
  message = 'message',
}

export interface InboxItem {
  _id: string;
  followers: string[];
  drawing: string;
  thumbnail: string;
  image: string;
  date: Date;
  sender: string | undefined;
  reply?: InboxItem;
  comments: Comment[];
}

export interface Comment {
  sender?: string;
  message: string;
  _id: string;
  date: Date;
}

export interface User {
  _id: string;
  name: string;
  img?: string;
  mate?: Mate;
  inbox: string[];
  subscription?: PushSubscription;
}

export interface Mate {
  _id: string;
  name: string;
  img?: string;
}

export interface SocketLoginParams {
  _id: string;
}

export interface MatchParams {
  _id: string;
  mate_id: string;
}

export interface SendParams {
  _id: string;
  mate_id: string;
  drawing: string;
  img: string;
}

export interface SendRes {
  inboxItem: InboxItem;
}

export interface CommentParams {
  inbox_id: string;
  sender: string;
  message: string;
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
  _id: string;
}

export interface GetUserParams {
  _id: string;
}

export interface MatchRes {
  mate: Mate;
}

export interface SubscribeParams {
  subscription: PushSubscription;
  _id: string;
}

export interface ChangeUserNameParams {
  _id: string;
  mate_id?: string;
  name: string;
}

export interface UploadProfileImgParams {
  _id: string;
  mate_id?: string;
  img: any;
  previousImage?: string;
}

export interface ChangeNameRes {
  mate_name: string;
}

export type Res<T> = T | undefined | null;

export interface API {
  createUser(): Promise<Res<User>>;

  getUser(params: GetUserParams): Promise<Res<User>>;

  subscribe(params: SubscribeParams): Promise<Res<void>>;

  unsubscribe(params: GetUserParams): Promise<Res<void>>;

  getInbox(params: GetInboxItemsParams): Promise<Res<InboxItem[]>>;

  comment(params: CommentParams): Promise<Res<Comment>>;

  removeFromInbox(params: RemoveFromInboxParams): Promise<Res<void>>;

  changeUserName(params: ChangeUserNameParams): Promise<Res<void>>;

  uploadProfileImg(params: UploadProfileImgParams): Promise<Res<string>>;
}

export interface SocketAPI {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  match: (params: MatchParams) => Promise<void>;
  send: (params: SendParams) => Promise<void>;

  unMatch(params: UnMatchParams): Promise<void>;

  login(params: SocketLoginParams): Promise<void>;
}

export enum ENDPOINTS {
  user = '/user',
  subscribe = '/subscribe',
  unsubscribe = '/unsubscribe',
  inbox = '/inbox',
}

export enum SOCKET_ENDPONTS {
  match = 'match',
  unmatch = 'unmatch',
  login = 'login',
  send = 'send',
  disconnect = 'disconnect',
}
