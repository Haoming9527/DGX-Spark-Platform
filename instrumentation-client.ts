import { initBotId } from "botid/client/core";

initBotId({
  protect: [
    { path: "/api/chat", method: "POST" },
    { path: "/api/web-search", method: "POST" },
    { path: "/api/auth/login", method: "POST" },
    { path: "/api/auth/signup", method: "POST" },
  ],
});
