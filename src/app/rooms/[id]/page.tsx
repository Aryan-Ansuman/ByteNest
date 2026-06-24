import RoomClient from "./RoomClient";

interface Props {
    params: { id: string };
    searchParams: { token?: string };
}

export default function RoomPage({ params, searchParams }: Props) {
    return (
        <RoomClient
            roomId={params.id}
            inviteToken={searchParams.token}
        />
    );
}
