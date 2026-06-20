import { z } from "zod";

export function parseApiPayload<T>(schema: z.ZodType<T>, data: unknown): T {
  return schema.parse(data);
}

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}
