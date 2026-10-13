import { useSession } from "@/api/queries";
import { clearInstanceDefaultsCache } from "@/hooks/useInstanceDefaultsCache";
import { useQueryClient } from "@tanstack/react-query";

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: session, isLoading } = useSession();

  const logout = async () => {
    await fetch("/auth/logout");
    clearInstanceDefaultsCache();
    window.location.reload();
    // Queries should be invalid from a reload
    queryClient.invalidateQueries();
  };

  return {
    session,
    isAuthenticated: session !== null && session !== undefined,
    isLoading,
    logout,
  };
}

