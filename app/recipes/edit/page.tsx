"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RecipeEditPage() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    params.set("mode", "elements");
    router.replace(`/recipes?${params.toString()}`);
  }, [router]);

  return null;
}
