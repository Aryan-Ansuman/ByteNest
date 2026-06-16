import React from "react";
import EditProfileClient from "./EditProfileClient";
import { users } from "@/models/server/config";
import { UserPrefs } from "@/store/Auth";

const Page = async ({ params }: { params: { userId: string; userSlug: string } }) => {
    const user = await users.get<UserPrefs>(params.userId);

    return (
        <EditProfileClient
            userId={params.userId}
            userSlug={params.userSlug}
            initialName={user.name}
            initialEmail={user.email}
            initialReputation={user.prefs?.reputation ?? 0}
            createdAt={user.$createdAt}
        />
    );
};

export default Page;
