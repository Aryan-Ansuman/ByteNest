import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type {
    DiscussionRoom,
    RoomMessage,
    RoomMember,
    CodeSession,
} from "@/types/rooms";

// ─── Room slice ───────────────────────────────────────────────

interface RoomSlice {
    room: DiscussionRoom | null;
    codeSession: CodeSession | null;
    isInitialized: boolean;
    isInitializing: boolean;
    initError: string | null;
    setRoom: (room: DiscussionRoom) => void;
    updateRoom: (partial: Partial<DiscussionRoom>) => void;
    setCodeSession: (session: CodeSession | null) => void;
    setInitialized: (v: boolean) => void;
    setInitializing: (v: boolean) => void;
    setInitError: (e: string | null) => void;
    resetStore: () => void;
}

// ─── Chat slice ───────────────────────────────────────────────

interface ChatSlice {
    messages: RoomMessage[];
    hasMore: boolean;
    isLoadingMore: boolean;
    oldestTimestamp: string | null;
    typingUserNames: string[];
    setMessages: (msgs: RoomMessage[]) => void;
    addMessage: (msg: RoomMessage) => void;
    prependMessages: (msgs: RoomMessage[], hasMore: boolean) => void;
    updateMessage: (msg: RoomMessage) => void;
    deleteMessage: (id: string) => void;
    replaceTempMessage: (tempId: string, real: RoomMessage) => void;
    setLoadingMore: (v: boolean) => void;
    setTypingUsers: (names: string[]) => void;
    setTypingStatus: (roomId: string, isTyping: boolean) => void;
}

// ─── Presence slice ───────────────────────────────────────────

interface PresenceSlice {
    members: RoomMember[];
    currentMember: RoomMember | null;
    setMembers: (members: RoomMember[]) => void;
    upsertMember: (member: RoomMember) => void;
    removeMember: (id: string) => void;
    setCurrentMember: (member: RoomMember | null) => void;
}

// ─── Combined store ───────────────────────────────────────────

export type RoomStore = RoomSlice & ChatSlice & PresenceSlice;

const INITIAL_STATE = {
    room: null,
    codeSession: null,
    isInitialized: false,
    isInitializing: false,
    initError: null,
    messages: [],
    hasMore: false,
    isLoadingMore: false,
    oldestTimestamp: null,
    typingUserNames: [],
    members: [],
    currentMember: null,
};

export const useRoomStore = create<RoomStore>()(
    subscribeWithSelector((set) => ({
        // ── Room slice ────────────────────────────────────────
        ...INITIAL_STATE,

        setRoom: (room) => set({ room }),
        updateRoom: (partial) =>
            set((s) => ({
                room: s.room ? { ...s.room, ...partial } : s.room,
            })),
        setCodeSession: (codeSession) => set({ codeSession }),
        setInitialized: (isInitialized) => set({ isInitialized }),
        setInitializing: (isInitializing) => set({ isInitializing }),
        setInitError: (initError) => set({ initError }),
        resetStore: () => set(INITIAL_STATE),

        // ── Chat slice ────────────────────────────────────────
        setMessages: (messages) =>
            set({
                messages,
                oldestTimestamp: messages[0]?.$createdAt ?? null,
            }),
        addMessage: (msg) =>
            set((s) => {
                // Deduplicate by $id
                if (s.messages.some((m) => m.$id === msg.$id)) return s;
                return { messages: [...s.messages, msg] };
            }),
        prependMessages: (msgs, hasMore) =>
            set((s) => ({
                messages: [...msgs, ...s.messages],
                hasMore,
                oldestTimestamp: msgs[0]?.$createdAt ?? s.oldestTimestamp,
                isLoadingMore: false,
            })),
        updateMessage: (msg) =>
            set((s) => ({
                messages: s.messages.map((m) => (m.$id === msg.$id ? msg : m)),
            })),
        deleteMessage: (id) =>
            set((s) => ({
                messages: s.messages.filter((m) => m.$id !== id),
            })),
        replaceTempMessage: (tempId, real) =>
            set((s) => ({
                messages: s.messages.map((m) => (m.$id === tempId ? real : m)),
            })),
        setLoadingMore: (isLoadingMore) => set({ isLoadingMore }),
        setTypingUsers: (typingUserNames) => set({ typingUserNames }),
        setTypingStatus: (roomId, isTyping) => {
            // TODO: Implement actual real-time typing status broadcast here
        },

        // ── Presence slice ────────────────────────────────────
        setMembers: (members) => set({ members }),
        upsertMember: (member) =>
            set((s) => {
                const idx = s.members.findIndex((m) => m.$id === member.$id);
                if (idx === -1) return { members: [...s.members, member] };
                const next = [...s.members];
                next[idx] = member;
                return { members: next };
            }),
        removeMember: (id) =>
            set((s) => ({
                members: s.members.filter((m) => m.$id !== id),
            })),
        setCurrentMember: (currentMember) => set({ currentMember }),
    }))
);
