import type { AppEnv } from "../types";

export function getEnv(): AppEnv {
  return (typeof window !== "undefined" && window.__ENV__) || {};
}

export function seedDemoEnabled(): boolean {
  return getEnv().SEED_DEMO === "1";
}
