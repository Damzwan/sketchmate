export enum NotificationType {
  match = 'match',
  unmatch = 'unmatch',
  message = 'message',
  comment = 'comment'
}

export interface InboxItem {
  _id: string
  followers: string[]
  drawing: string
  thumbnail: string
  image: string
  date: Date
  sender: string
  reply?: InboxItem
  comments: Comment[]
}

export interface Comment {
  sender: string
  message: string
  _id: string
  date: Date
}

export interface User {
  _id: string
  name: string
  img: string
  mate?: Mate
  inbox: string[]
  stickers: string[]
  emblems: string[]
  saved: Saved[]
  subscription?: string
}

export interface Mate {
  _id: string
  name: string
  img: string
}

export interface SocketLoginParams {
  _id: string
}

export interface MatchParams {
  _id: string
  mate_id: string
}

export interface SendParams {
  _id: string
  name: string
  mate_id: string
  drawing: string
  img: any
}

export interface SendRes {
  inboxItem: InboxItem
}

export interface CommentParams {
  inbox_id: string
  sender: string
  message: string
  mate_id: string
  name: string
}

export interface CommentRes {
  comment: Comment
  inbox_item_id: string
}

export interface GetInboxItemsParams {
  _ids: string[]
}

export interface RemoveFromInboxParams {
  user_id: string
  inbox_id: string
}

export interface UnMatchParams {
  mate_id: string
  name: string
  _id: string
}

export interface GetUserParams {
  _id: string
}

export interface MatchRes {
  mate: Mate
}

export interface SubscribeParams {
  subscription: string
  _id: string
}

export interface DeleteStickerParams {
  user_id: string
  sticker_url: string
}

export interface DeleteEmblemParams {
  user_id: string
  emblem_url: string
}

export interface ChangeUserNameParams {
  _id: string
  mate_id?: string
  name: string
}

export interface UploadProfileImgParams {
  _id: string
  mate_id?: string
  img: any
  previousImage?: string
}

export interface CreateStickerParams {
  _id: string
  img: any
}

export interface CreateEmblemParams {
  _id: string
  img: any
}

export interface CreateSavedParams {
  _id: string
  img: any
  drawing: any
}

export interface DeleteSavedParams {
  user_id: string
  drawing_url: string
  img_url: string
}

export interface ChangeNameRes {
  mate_name: string
}

export interface CreateUserParams {
  name?: string
  img?: any
  subscription?: string
}

export interface Saved {
  drawing: string
  img: string
}

export type Res<T> = T | undefined

export interface API {
  createUser(params: CreateUserParams): Promise<Res<User>>

  getUser(params: GetUserParams): Promise<Res<User>>

  subscribe(params: SubscribeParams): Promise<Res<void>>

  unsubscribe(params: GetUserParams): Promise<Res<void>>

  getInbox(params: GetInboxItemsParams): Promise<Res<InboxItem[]>>

  removeFromInbox(params: RemoveFromInboxParams): Promise<Res<void>>

  changeUserName(params: ChangeUserNameParams): Promise<Res<void>>

  uploadProfileImg(params: UploadProfileImgParams): Promise<Res<string>>

  createSticker(params: CreateStickerParams): Promise<Res<string>>

  createEmblem(params: CreateEmblemParams): Promise<Res<string>>

  deleteSticker(params: DeleteStickerParams): Promise<void>

  deleteEmblem(params: DeleteEmblemParams): Promise<void>

  createSaved(params: CreateSavedParams): Promise<Res<Saved>>

  deleteSaved(params: DeleteSavedParams): Promise<void>
}

export interface SocketAPI {
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  match: (params: MatchParams) => Promise<void>
  send: (params: SendParams) => Promise<void>

  unMatch(params: UnMatchParams): Promise<void>

  comment(params: CommentParams): Promise<void>

  login(params: SocketLoginParams): Promise<void>
}

export enum ENDPOINTS {
  user = '/user',
  subscribe = '/subscribe',
  unsubscribe = '/unsubscribe',
  inbox = '/inbox',
  sticker = '/sticker',
  emblem = '/emblem',
  saved = '/saved'
}

export enum SOCKET_ENDPONTS {
  match = 'match',
  unmatch = 'unmatch',
  login = 'login',
  send = 'send',
  disconnect = 'disconnect',
  comment = 'comment'
}
