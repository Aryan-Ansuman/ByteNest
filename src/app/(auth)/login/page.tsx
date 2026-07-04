import { Suspense } from "react";

import { LoginForm } from "./LoginForm";

export default function Login() {
    return (
        <Suspense fallback={<div className="flex h-screen items-center justify-center bg-[#080808]"><div className="size-8 animate-spin rounded-full border-2 border-[#a7c8b3] border-t-transparent" /></div>}>
            <LoginForm />
        </Suspense>
    );
}
