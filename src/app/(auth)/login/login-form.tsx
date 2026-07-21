"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { Button, Card, Input, Label, Spinner } from "@/components/ui";
import { toast } from "sonner";

export function LoginForm({ clinicName }: { clinicName: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await authClient.signIn.username({
      username: username.trim(),
      password,
      rememberMe: true, // persistent cookie — login survives until explicit logout
    });
    setLoading(false);
    if (error) {
      toast.error("שם משתמש או סיסמה שגויים");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">
            {clinicName.trim().charAt(0) || "מ"}
          </div>
          <h1 className="text-xl font-bold">{clinicName} — ניהול חדרים</h1>
          <p className="text-sm text-muted-foreground">התחברות למערכת</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="username">שם משתמש</Label>
            <Input
              id="username"
              dir="ltr"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="password">סיסמה</Label>
            <Input
              id="password"
              type="password"
              dir="ltr"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? <Spinner /> : "כניסה"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
