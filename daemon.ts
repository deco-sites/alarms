import { Alarm, Alarms } from "./kv.ts";

const TIMEOUT_MS = 60_000;
const tryAck = async (alarm: Alarm): Promise<void> => {
  try {
    const abrt = new AbortController();
    setTimeout(() => abrt.abort(), TIMEOUT_MS);
    const response = await fetch(alarm.url, {
      method: "POST",
      signal: abrt.signal,
    });
    if (response.ok) {
      await Alarms.ack(alarm);
    }
  } catch (error) {
    const retries = await Alarms.getRetries(alarm);
    if (retries === null) {
      await Alarms.retry(alarm, error.message);
    } else if (retries.count === 10) {
      await Alarms.ack(alarm);
    }
  }
};
/**
 * Starts a Deno process that runs the scheduler daemon.
 *
 * The scheduler daemon is a process that runs in the background and runs
 * scheduled tasks. It is started automatically by the `deno task start`
 * command.
 */
export const startSechedulerD = async () => {
  const inflight: Record<string, Promise<void>> = {};
  for await (const alarm of Alarms.watch()) {
    inflight[alarm.id] ??= tryAck(alarm).finally(() =>
      delete inflight[alarm.id]
    );
  }
  await Promise.all(Object.values(inflight));
};
