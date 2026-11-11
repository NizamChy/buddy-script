/* Seeds demo accounts and some sample content. Safe to run repeatedly. */
import bcrypt from "bcryptjs";
import { PrismaClient, type Role } from "@prisma/client";

const prisma = new PrismaClient();

const users: Array<{
  key: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: Role;
  avatarUrl: string | null;
}> = [
  { key: "demo", firstName: "Demo", lastName: "User", email: "demo@buddyscript.com", password: "Demo@12345", role: "USER", avatarUrl: "/images/profile.png" },
  { key: "admin", firstName: "Admin", lastName: "Buddy", email: "admin@buddyscript.com", password: "Admin@12345", role: "ADMIN", avatarUrl: null },
  { key: "karim", firstName: "Karim", lastName: "Saif", email: "karim@buddyscript.com", password: "Karim@12345", role: "USER", avatarUrl: "/images/post_img.png" },
  { key: "radovan", firstName: "Radovan", lastName: "SkillArena", email: "radovan@buddyscript.com", password: "Radovan@12345", role: "USER", avatarUrl: "/images/txt_img.png" },
  { key: "steve", firstName: "Steve", lastName: "Jobs", email: "steve@buddyscript.com", password: "Steve@12345", role: "USER", avatarUrl: "/images/people1.png" },
  { key: "ryan", firstName: "Ryan", lastName: "Roslansky", email: "ryan@buddyscript.com", password: "Ryan@12345", role: "USER", avatarUrl: "/images/people2.png" },
];

async function main() {
  const ids: Record<string, string> = {};
  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 12);
    const row = await prisma.user.upsert({
      where: { email: u.email },
      update: { role: u.role },
      create: {
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        passwordHash,
        role: u.role,
        avatarUrl: u.avatarUrl,
      },
    });
    ids[u.key] = row.id;
  }

  if ((await prisma.post.count()) > 0) {
    console.log("Posts already exist, skipping sample content.");
    return;
  }

  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

  const p1 = await prisma.post.create({
    data: {
      authorId: ids.karim,
      content: "-Healthy Tracking App\n\nJust shipped the first version of our health tracking app. Feedback welcome!",
      imageUrl: "/images/timeline_img.png",
      imageWidth: 1200,
      imageHeight: 790,
      visibility: "PUBLIC",
      createdAt: minutesAgo(180),
    },
  });
  const p2 = await prisma.post.create({
    data: {
      authorId: ids.steve,
      content: "Design is not just what it looks like and feels like. Design is how it works.",
      visibility: "PUBLIC",
      createdAt: minutesAgo(90),
    },
  });
  await prisma.post.create({
    data: {
      authorId: ids.demo,
      content: "This is a private note - only I can see it. \u{1F512}",
      visibility: "PRIVATE",
      createdAt: minutesAgo(30),
    },
  });
  await prisma.post.create({
    data: {
      authorId: ids.ryan,
      content: "Hiring! We're looking for curious engineers who love building for people. DM me.",
      visibility: "PUBLIC",
      createdAt: minutesAgo(10),
    },
  });

  // Likes
  const likers = [ids.radovan, ids.steve, ids.ryan, ids.admin];
  await prisma.postLike.createMany({ data: likers.map((userId) => ({ postId: p1.id, userId })) });
  await prisma.post.update({ where: { id: p1.id }, data: { likeCount: likers.length } });
  await prisma.postLike.createMany({ data: [{ postId: p2.id, userId: ids.karim }] });
  await prisma.post.update({ where: { id: p2.id }, data: { likeCount: 1 } });

  // Comments + replies
  const c1 = await prisma.comment.create({
    data: {
      postId: p1.id,
      authorId: ids.radovan,
      content: "It is a long established fact that a reader will be distracted by the readable content of a page when looking at its layout.",
      createdAt: minutesAgo(120),
    },
  });
  await prisma.comment.create({
    data: { postId: p1.id, authorId: ids.karim, parentId: c1.id, content: "Thanks Radovan! \u{1F64C}", createdAt: minutesAgo(100) },
  });
  await prisma.commentLike.create({ data: { commentId: c1.id, userId: ids.karim } });
  await prisma.comment.update({ where: { id: c1.id }, data: { likeCount: 1, replyCount: 1 } });
  await prisma.comment.create({
    data: { postId: p1.id, authorId: ids.steve, content: "Looks clean. Ship it!", createdAt: minutesAgo(60) },
  });
  await prisma.post.update({ where: { id: p1.id }, data: { commentCount: 3 } });

  console.log("Seeded demo users and sample content.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
