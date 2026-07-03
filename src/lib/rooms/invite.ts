import type { DiscussionRoom } from "@/types/rooms";

export function getRoomInvitePath(room: Pick<DiscussionRoom, "$id" | "visibility" | "inviteToken">) {
    if (room.visibility === "private" && room.inviteToken) {
        return `/rooms/join/${room.inviteToken}`;
    }

    return `/rooms/${room.$id}`;
}

export function getRoomInviteUrl(
    room: Pick<DiscussionRoom, "$id" | "visibility" | "inviteToken">,
    origin: string
) {
    return `${origin}${getRoomInvitePath(room)}`;
}
