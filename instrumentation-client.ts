import { initBotId } from "botid/client/core";

initBotId({
  protect: [
    { path: "/api/chat", method: "POST", advancedOptions: { checkLevel: "basic" } },
    { path: "/api/web-search", method: "POST", advancedOptions: { checkLevel: "basic" } },
    { path: "/api/auth/login", method: "POST", advancedOptions: { checkLevel: "basic" } },
    { path: "/api/auth/signup", method: "POST", advancedOptions: { checkLevel: "basic" } },
  ],
});
