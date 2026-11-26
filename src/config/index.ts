import process from "node:process";

export const LEASE_SECONDS = Number(process.env.LEASE_SECONDS);
export const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS);
export const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS);

const configValues = {
  LEASE_SECONDS,
  REQUEST_TIMEOUT_MS,
  POLL_INTERVAL_MS,
};

for (const [key, value] of Object.entries(configValues)) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid configuration: ${key} must be a positive number`);
  }
}
//this is just a config file for validating env values before using....
