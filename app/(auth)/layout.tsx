import { AuthProvider } from "@/lib/auth-context";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <TooltipProvider>{children}</TooltipProvider>
    </AuthProvider>
  );
}