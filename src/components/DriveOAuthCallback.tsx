import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Handles redirect from Google OAuth callback: ?drive_connected=1 or ?drive_error=...
 * Shows toast and clears query params from URL.
 */
export function DriveOAuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const connected = params.get("drive_connected");
    const error = params.get("drive_error");
    if (connected !== "1" && !error) return;

    if (connected === "1") {
      toast({ title: "Google Drive connected", description: "You can now upload filings to your Drive." });
      queryClient.invalidateQueries({ queryKey: ["transcripts-drive-status"] });
    } else if (error) {
      toast({
        title: "Drive connection failed",
        description: decodeURIComponent(error).replace(/_/g, " "),
        variant: "destructive",
      });
    }
    navigate(location.pathname || "/", { replace: true });
  }, [location.search, location.pathname, navigate, toast, queryClient]);

  return null;
}
