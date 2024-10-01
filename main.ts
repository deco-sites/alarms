import { startSechedulerD } from "./daemon.ts";
import { kv } from "./kv.ts";
const portEnv = Deno.env.get("PORT");
const port = portEnv ? +portEnv : 8000;

startSechedulerD();
Deno.serve({
  handler: async (req) => {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/alarms")) {
      const { url, triggerAt }: { url: string; triggerAt: number } = await req
        .json();
      if (!url || !triggerAt) {
        return Response.json({ error: "Missing URL or trigger time" }, {
          status: 400,
        });
      }
      const alarmId = crypto.randomUUID();
      // Store webhook with trigger time in Deno.Kv
      const key = ["webhook", triggerAt, alarmId];
      await kv.set(key, { url, triggerAt });

      return Response.json({ alarmId }, { status: 201 });
    }
    console.log("hello", req.url);
    return new Response(null, { status: 200 });
  },
  port,
});
