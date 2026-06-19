"use client";

import React from "react";
import { useAuthStore } from "@/store/Auth";

export default function AuthBootstrap() {
    const verfiySession = useAuthStore((state) => state.verfiySession);

    React.useEffect(() => {
        void verfiySession();
    }, [verfiySession]);

    return null;
}
