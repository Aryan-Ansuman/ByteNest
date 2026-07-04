import { Suspense } from "react";

import { RegisterForm } from "./RegisterForm";

export default function Register() {
    return (
        <Suspense fallback={<div className="flex h-screen items-center justify-center bg-[#080808]"><div className="size-8 animate-spin rounded-full border-2 border-[#a7c8b3] border-t-transparent" /></div>}>
            <RegisterForm />
        </Suspense>
    );
}
