import { cookies } from "next/headers";
import { SESSION_COOKIE, verifyToken } from "@/lib/auth";
import { ChatInterface } from "./components/ChatInterface";

export default async function Home() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = token ? verifyToken(token) : null;
  const initialUser = session
    ? {
        id: session.userId,
        username: session.username,
        email: session.email,
        role: session.role,
      }
    : null;

  return (
    <main className="h-[100svh] min-h-[100svh]">
      <ChatInterface initialUser={initialUser} />
    </main>
  );
}
