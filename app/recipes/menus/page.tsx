"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RecipeMenusPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/recipes?mode=compose");
  }, [router]);

  return null;
}
