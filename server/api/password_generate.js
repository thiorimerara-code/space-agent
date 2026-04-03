import { createPasswordVerifier } from "../lib/auth/passwords.js";

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function readPayload(context) {
  return context.body && typeof context.body === "object" && !Buffer.isBuffer(context.body)
    ? context.body
    : {};
}

export function post(context) {
  const payload = readPayload(context);

  if (typeof payload.password !== "string") {
    throw createHttpError("Password must be provided as a string.", 400);
  }

  return {
    headers: {
      "Cache-Control": "no-store"
    },
    status: 200,
    body: createPasswordVerifier(payload.password)
  };
}
