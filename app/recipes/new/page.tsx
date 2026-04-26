"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RecipeNewPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/recipes?mode=elements");
  }, [router]);
  return null;
}
