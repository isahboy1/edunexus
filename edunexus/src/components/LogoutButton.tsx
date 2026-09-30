"use client";

import { useRouter } from "next/navigation";
import { ReactNode } from "react";
import { api, clearToken } from "@/lib/laravel";

export function LogoutButton({
  className = "btn-outline btn-sm",
  ariaLabel,
  children = "Logout",
}: {
  className?: string;
  ariaLabel?: string;
  children?: ReactNode;
}) {
  const router = useRouter();

  async function logout() {
    // Revoke the Sanctum token server-side (best effort), then drop the cookie.
    await api("/auth/logout", { method: "POST" });
    clearToken();
    router.push("/login");
    router.refresh();
  }

  return (
    <button className={className} type="button" onClick={logout} aria-label={ariaLabel}>
      {children}
    </button>
  );
}
