"use client";

import { createAuthClient } from "better-auth/react";
import { usernameClient, adminClient, inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "./auth";

export const authClient = createAuthClient({
  plugins: [usernameClient(), adminClient(), inferAdditionalFields<typeof auth>()],
});

export const { signIn, signOut, useSession } = authClient;
