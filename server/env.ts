import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const envPath = path.join(process.cwd(), ".env");

export function reloadEnv() {
  dotenv.config({ path: envPath, override: true });
}

export function watchEnvInDev() {
  if (process.env.NODE_ENV === "production") return;
  if (!fs.existsSync(envPath)) return;

  let timer: ReturnType<typeof setTimeout> | null = null;
  fs.watch(envPath, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      reloadEnv();
      // eslint-disable-next-line no-console
      console.log("[trip-flow] .env 已重新載入");
    }, 200);
  });
}
