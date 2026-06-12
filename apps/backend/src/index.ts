import { toNodeHandler } from "better-auth/node";
import express from "express";

import { auth } from "./auth";
import { initializeIdleServers, initializeOnStartup } from "./lib/startup";
import mcpProxyRouter from "./routers/mcp-proxy";
import oauthRouter from "./routers/oauth";
import publicEndpointsRouter from "./routers/public-metamcp";
import trpcRouter from "./routers/trpc";

const app = express();

// Mount OAuth metadata endpoints at root level for .well-known discovery
app.use(oauthRouter);

// Mount better-auth before body parsing (better-auth reads the raw request body)
app.all("/api/auth/{*any}", toNodeHandler(auth));

// Global JSON middleware for non-proxy routes
app.use((req, res, next) => {
  if (
    req.path.startsWith("/mcp-proxy/") ||
    req.path.startsWith("/metamcp/") ||
    req.path.startsWith("/api/auth")
  ) {
    // Skip JSON parsing for MCP routes, public endpoints, and auth routes
    next();
  } else {
    express.json({ limit: "50mb" })(req, res, next);
  }
});

// Mount public endpoints routes (must be before JSON middleware to handle raw streams)
app.use("/metamcp", publicEndpointsRouter);

// Mount MCP proxy routes
app.use("/mcp-proxy", mcpProxyRouter);

// Mount tRPC routes
app.use("/trpc", trpcRouter);

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "metamcp-backend",
  });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
  });
});

async function start(): Promise<void> {
  // Startup initialization (must run after DB is reachable/migrations are applied, and before listening)
  await initializeOnStartup();

  app.listen(12009, async () => {
    console.log(`Server is running on port 12009`);
    console.log(`Auth routes available at: http://localhost:12009/api/auth`);
    console.log(
      `Public MetaMCP endpoints available at: http://localhost:12009/metamcp`,
    );
    console.log(
      `MCP Proxy routes available at: http://localhost:12009/mcp-proxy`,
    );
    console.log(`tRPC routes available at: http://localhost:12009/trpc`);

    // Wait a moment for the server to be fully ready to handle incoming connections,
    // then initialize idle servers (prevents connection errors when MCP servers connect back)
    console.log(
      "Waiting for server to be fully ready before initializing idle servers...",
    );
    await new Promise((resolve) => setTimeout(resolve, 3000)).then(
      initializeIdleServers,
    );
  });
}

export default app;

if (!process.env.VERCEL) {
  start().catch((err) => {
    console.error("❌ Fatal startup error:", err);
    // Do not throw - keep consistent with other startup behavior
  });
}
