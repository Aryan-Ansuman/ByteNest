"use client";

import { useAuthStore } from "@/store/Auth"
import { useRouter, useSearchParams } from "next/navigation";
import React from "react";


const Layout = ({children}: {children: React.ReactNode}) => {
  const {session} = useAuthStore();
  const router = useRouter()
  const searchParams = useSearchParams()

  React.useEffect(() => {
    if (session) {
      const next = searchParams.get("next")
      router.push(next?.startsWith("/") && !next.startsWith("//") ? next : "/")
    }
  }, [session, router, searchParams])

  if (session) {
    return null
  }

  return (
    <>{children}</>
  )
}


export default Layout
