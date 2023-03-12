import { PushSubscription } from 'web-push';

export interface InboxItem {
  drawing: string;
  date: Date;
  sender: string | undefined;
  img: string;
}

export interface User {
  _id: string;
  name?: string;
  mate?: string;
  inbox: InboxItem[];
  subscription?: PushSubscription;
}

export interface CreateUserRes {
  _id: string;
}

export interface SocketLoginParams {
  _id: string;
}

export interface MatchParams {
  _id: string;
  mate: string;
}

export interface SendParams {
  _id: string;
  mate: string;
  drawing: string;
  img: string;
}

export interface SendRes {
  inboxItem: InboxItem;
}

export interface UnMatchParams {
  mate: string;
  _id: string;
}

export interface GetUserParams {
  _id: string;
}

export interface MatchRes {
  mate: string;
}

export interface SubscribeParams {
  subscription: PushSubscription;
  _id: string;
}

export interface GetMateInfoParams {
  mate: string;
}

export interface GetMateInfoRes {
  name?: string;
}

export interface ChangeNameParams {
  _id: string;
  name: string;
}

export type Res<T> = T | undefined | null;

export enum Notifications {
  message = 'message',
}

export interface API {
  createUser(): Promise<Res<CreateUserRes>>;

  getUser(params: GetUserParams): Promise<Res<User>>;

  getDrawings(params: GetUserParams): Promise<Res<InboxItem[]>>;

  subscribe(params: SubscribeParams): Promise<Res<void>>;

  unsubscribe(params: GetUserParams): Promise<Res<void>>;

  changeName(params: ChangeNameParams): Promise<void>;

  getMateInfo(params: GetMateInfoParams): Promise<Res<GetMateInfoRes>>;
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
  create_user = '/create_user',
  get_user = '/user',
  get_drawings = '/drawing',
  subscribe = '/subscribe',
  unsubscribe = '/unsubscribe',
  change_name = '/change_name',
  mate = '/mate',
}

export enum SOCKET_ENDPONTS {
  match = 'match',
  unmatch = 'unmatch',
  login = 'login',
  send = 'send',
  disconnect = 'disconnect',
}
