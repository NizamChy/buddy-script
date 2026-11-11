import { z } from "zod";
import { badRequest } from "./errors";

/**
 * Opaque keyset-pagination cursor: (createdAt, id) of the last item on the page.
 * Keyset pagination stays O(page size) no matter how deep the user scrolls,
 * unlike OFFSET which scans and discards every skipped row.
 */
export interface Cursor {
  createdAt: Date;
  id: string;
}

const cursorSchema = z.object({ t: z.iso.datetime(), id: z.uuid() });

export function encodeCursor(item: { createdAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ t: item.createdAt.toISOString(), id: item.id })).toString(
    "base64url",
  );
}

export function decodeCursor(raw: unknown): Cursor | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string") throw badRequest("Invalid cursor");
  try {
    const parsed = cursorSchema.parse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    return { createdAt: new Date(parsed.t), id: parsed.id };
  } catch {
    throw badRequest("Invalid cursor");
  }
}

export const limitSchema = (def: number, max: number) =>
  z.coerce.number().int().min(1).max(max).default(def);
