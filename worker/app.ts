import { Hono } from "hono";
import { cors } from "hono/cors";
import apiRoutes from "./routes/api";
import assetsRoutes from "./routes/assets";
import adminAuthRoutes, { adminHeaders, requireAdministrator } from "./services/adminAuth";
import managementRoutes from "./routes/management";
import mapExportRoutes from "./routes/mapExport";

type HonoEnv = { Bindings: Env };

const app = new Hono<HonoEnv>();

app.use("/admin", adminHeaders);
app.use("/admin/*", adminHeaders);
app.route("/admin/auth", adminAuthRoutes);
app.use("/admin/api/*", requireAdministrator);
app.route("/admin/api", managementRoutes);
app.route("/api/map-export", mapExportRoutes);

app.use(
  "/api/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  }),
);

app.route("/api", apiRoutes);
app.all("*", assetsRoutes);

app.onError((err, c) => {
  console.error("Unhandled worker error", err);
  const isApi = new URL(c.req.url).pathname.startsWith("/api/");
  if (isApi) return c.json({ error: "Worker Error" }, 500);
  return c.text("Worker Error", 500);
});

export default app;
