export type RoomVisibility = "public" | "private";
export type RoomStatus     = "active" | "archived";
export type SlowMode       = "off" | "5s" | "30s" | "60s";
export type MemberStatus   = "online" | "away" | "offline" | "muted";
export type MemberRole     = "host" | "member";
export type MessageType    = "text" | "code" | "system";
export type SessionStatus  = "active" | "ended";

export interface DiscussionRoom {
  $id: string;
  $createdAt: string;
  hostId: string;
  name: string;
  description?: string;
  tags: string[];
  visibility: RoomVisibility;
  status: RoomStatus;
  memberCount: number;
  maxMembers: number;
  lastActivityAt: string;
  activeCodeSessionId?: string;
  inviteToken?: string;
  slowMode: SlowMode;
}

export interface RoomMessage {
  $id: string;
  $createdAt: string;
  roomId: string;
  authorId: string;
  authorName: string;
  authorColor: string;
  body: string;
  type: MessageType;
  language?: string;
  reactions?: string;       // JSON string: {"👍":["uid1"]}
  replyToId?: string;
  editedAt?: string;
  deletedAt?: string;
}

export interface RoomMember {
  $id: string;
  $createdAt: string;
  roomId: string;
  userId: string;
  displayName: string;
  avatarColor: string;
  role: MemberRole;
  status: MemberStatus;
  joinedAt: string;
  lastSeenAt: string;
}

export interface CodeSession {
  $id: string;
  $createdAt: string;
  roomId: string;
  hostId: string;
  status: SessionStatus;
  files: string;            // JSON string: [{name, language}]
  activeFile: string;
  yjsSnapshotB64?: string;
  viewOnly: boolean;
  endedAt?: string;
}

export interface CollabMessage {
  $id: string;
  $createdAt: string;
  sessionId: string;
  roomId: string;
  senderId: string;
  update: string;           // base64 encoded Yjs binary
  type: 0 | 1;
}

export interface SessionFile {
  name: string;
  language: string;
}

export interface ParsedReactions {
  [emoji: string]: string[];
}
