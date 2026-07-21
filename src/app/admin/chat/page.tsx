import { requireAdmin } from "@/lib/auth/session";
import { AdminChat } from "@/components/admin-chat";
import { aiAvailable } from "@/lib/ai/enabled";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  await requireAdmin();
  return <AdminChat hasApiKey={await aiAvailable()} />;
}
