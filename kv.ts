import { join } from "@std/path";

const SCHEDULER_KV_DATABASE = Deno.env.get("SCHEDULER_KV_DATABASE") ??
  join(Deno.cwd(), "kv");

const SCHEDULER_DENO_KV_TOKEN = Deno.env.get("SCHEDULER_DENO_KV_TOKEN");
SCHEDULER_DENO_KV_TOKEN &&
  Deno.env.set("DENO_KV_ACCESS_TOKEN", SCHEDULER_DENO_KV_TOKEN);
function minutesNow(timestamp = Date.now()): number {
  const date = new Date(timestamp);

  // Set seconds and milliseconds to zero to floor to the start of the next minute
  date.setSeconds(0, 0);

  // Add one minute (60,000 milliseconds)
  const nextMinute = new Date(date.getTime() + 60 * 1000);

  // Subtract 1 millisecond to get the last millisecond of the current minute
  return nextMinute.getTime() - 1;
}

export const kv = await Deno.openKv(SCHEDULER_KV_DATABASE);

export interface Alarm extends CreateAlarmPayload {
  id: string;
}
export interface CreateAlarmPayload {
  id: string;
  url: string;
  triggerAt: number;
}
export interface Retry {
  reason: string;
  count: number;
}
const PREFIX = ["alarms"];
const ALARMS_PREFIX = ["alarms_retries"];
export const Alarms = {
  schedule: async (payload: CreateAlarmPayload): Promise<Alarm> => {
    const id = crypto.randomUUID();
    const key = [...PREFIX, payload.triggerAt, id];
    const alarm = { ...payload, id };
    await kv.set(key, alarm);
    return alarm;
  },
  error: async (payload: CreateAlarmPayload): Promise<Alarm> => {
    const id = crypto.randomUUID();
    const key = [...PREFIX, payload.triggerAt, id];
    const alarm = { ...payload, id };
    await kv.set(key, alarm);
    return alarm;
  },
  /******  a1bc3d19-29cd-40c8-9967-6c89db63b5f8  *******/
  ack: async (alarm: Alarm): Promise<void> => {
    await kv.delete([...PREFIX, alarm.triggerAt, alarm.id]);
  },
  retry: async (alarm: Alarm, reason: string): Promise<void> => {
    const retry = await kv.get<Retry>([...ALARMS_PREFIX, alarm.id]);

    let count = retry?.value?.count ?? 0;
    await kv.atomic().set([...ALARMS_PREFIX, alarm.id], {
      reason,
      count: ++count,
    }).check(retry)
      .commit();
  },
  getRetries: async (alarm: Alarm): Promise<Retry | null> => {
    const retry = await kv.get<Retry>([...ALARMS_PREFIX, alarm.id]);
    return retry?.value;
  },
  next: async function* (): AsyncIterableIterator<Alarm> {
    const iter = kv.list<Alarm>({
      prefix: PREFIX,
      end: [...PREFIX, minutesNow()],
    });

    for await (const alarm of iter) yield alarm.value;
  },
  async *watch() {
    while (true) {
      let foundAlarms = false;

      // Fetch and yield alarms
      for await (const alarm of Alarms.next()) {
        foundAlarms = true;
        yield alarm;
      }

      // Sleep until the next minute if no alarms were found
      if (!foundAlarms) {
        const now = new Date();
        const msUntilNextMinute = 60 * 1000 -
          (now.getSeconds() * 1000 + now.getMilliseconds());
        await new Promise((resolve) => setTimeout(resolve, msUntilNextMinute));
      }
    }
  },
};
