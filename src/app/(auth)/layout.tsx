"use client";

import { useAuthStore } from "@/store/Auth"
import { useRouter, useSearchParams } from "next/navigation";
import React, { Suspense } from "react";

function AuthRedirect() {
  const {session} = useAuthStore();
  const router = useRouter();
  const searchParams = useSearchParams();

  React.useEffect(() => {
    if (session) {
      const next = searchParams.get("next");
      router.push(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
    }
  }, [session, router, searchParams]);

  return null;
}

const Layout = ({children}: {children: React.ReactNode}) => {
  const {session} = useAuthStore();

  if (session) {
    return (
      <Suspense fallback={null}>
        <AuthRedirect />
      </Suspense>
    );
  }

  return (
    <>{children}</>
  );
}

export default Layout
