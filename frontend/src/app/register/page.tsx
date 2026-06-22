"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Register page redirects to the combined auth page with mode=register
// The sliding animation handles switching between forms on one page
export default function RegisterPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/login?mode=register");
  }, [router]);
  return null;
}
