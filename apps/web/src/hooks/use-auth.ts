"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export const meKey = ["me"] as const;

export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: async () => (await api.me()).user,
    staleTime: 5 * 60_000,
  });
}

export function useLogout() {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: api.logout,
    onSettled: () => {
      qc.clear();
      router.replace("/login");
      router.refresh();
    },
  });
}
