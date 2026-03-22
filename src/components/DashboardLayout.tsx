import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { FetchFilingsButton } from "@/components/FetchFilingsButton";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut } from "lucide-react";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { logout, user } = useAuth();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
            <SidebarTrigger className="ml-2" />
            <div className="ml-auto mr-4 flex items-center gap-3">
              <FetchFilingsButton />
              {user?.username ? (
                <span className="font-mono text-xs text-muted-foreground hidden sm:inline">{user.username}</span>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="font-mono text-xs gap-1"
                onClick={() => void logout()}
              >
                <LogOut className="h-3.5 w-3.5" />
                Log out
              </Button>
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
              <span className="font-mono text-xs text-muted-foreground">LIVE</span>
            </div>
          </header>
          <main className="flex-1 min-w-0 p-4 sm:p-6 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
