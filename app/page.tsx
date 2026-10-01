import { cookies } from "next/headers";
import { SESSION_COOKIE, verifyToken } from "@/lib/auth";
import { ChatInterface } from "./components/ChatInterface";

export default async function Home({ searchParams }: {
  searchParams: Promise<{ auth?: string | string[]; next?: string | string[] }>;
}) {
  const query = await searchParams;
  const authRequested = query.auth === "login";
  const returnTo = typeof query.next === "string" && ["/power", "/apikeys/manage", "/apikeys/usage", "/admin/infra"].includes(query.next)
    ? query.next : "/";
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
      <ChatInterface initialUser={initialUser} authRequested={authRequested} authReturnTo={returnTo} />
    </main>
  );
}
