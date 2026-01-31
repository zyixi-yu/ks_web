import { Hono } from "hono";
import { cors } from "hono/cors";
import apiRoutes from "./routes/api";
import assetsRoutes from "./routes/assets";

type HonoEnv = { Bindings: Env };

const app = new Hono<HonoEnv>();

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
