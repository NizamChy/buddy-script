import { prisma } from "../../lib/prisma";
import { deleteImage, processImage, putImage } from "../../lib/storage";
import { fanoutPost } from "../timeline/timeline.service";
import { defineJob } from "./queue";

/**
 * Normalises an uploaded image off the request path: decode, rotate, strip metadata,
 * resize, encode WebP, render a blur placeholder, upload, then flip the post to READY.
 * Idempotent: a retry after success finds no staging row and does nothing.
 */
export const processPostImage = defineJob<{ postId: string; stagingId: string }>(
  "image.process",
  async ({ postId, stagingId }) => {
    const staging = await prisma.uploadStaging.findUnique({ where: { id: stagingId } });
    if (!staging) return;
    const exists = await prisma.post.count({ where: { id: postId } });
    if (!exists) {
      await prisma.uploadStaging.deleteMany({ where: { id: stagingId } });
      return;
    }
    const image = await processImage(Buffer.from(staging.data));
    const url = await putImage(image.data);
    const updated = await prisma.$transaction(async (tx) => {
      const { count } = await tx.post.updateMany({
        where: { id: postId },
        data: {
          imageUrl: url,
          imageWidth: image.width,
          imageHeight: image.height,
          imageBlur: image.blur,
          imageStatus: "READY",
        },
      });
      await tx.uploadStaging.deleteMany({ where: { id: stagingId } });
      return count;
    });
    // The post was deleted while we were processing: don't leave the file behind.
    if (!updated) await deleteImage(url);
  },
  async ({ postId, stagingId }) => {
    await prisma.post.updateMany({ where: { id: postId }, data: { imageStatus: "FAILED" } });
    await prisma.uploadStaging.deleteMany({ where: { id: stagingId } });
  },
);

/** Pushes a post into followers' cached timelines (see timeline.service.ts). */
export const fanoutPostJob = defineJob<{ postId: string }>("timeline.fanout", ({ postId }) =>
  fanoutPost(postId),
);
