import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

function normEmail(v: unknown) {
  return String(v ?? "").toLowerCase().trim();
}

function normBool(v: unknown) {
  return String(v ?? "").trim().toLowerCase() === "true";
}

function normSecret(v: unknown) {
  return String(v ?? "").replace(/\r?\n$/, "");
}

function authUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isDraftCoach: user.isDraftCoach,
    coachDivision: user.coachDivision,
    coachesU11: !!user.coachesU11,
    coachesU13: !!user.coachesU13,
    isViewer: !!user.isViewer,
  } as any;
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },

  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = normEmail(credentials?.email);
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const allowDefaultAdmin = normBool(process.env.ALLOW_DEFAULT_ADMIN);
        const masterAdminEmail = normEmail(process.env.MASTER_ADMIN_EMAIL ?? "admin@cys.local");
        const masterAdminPassword = normSecret(process.env.MASTER_ADMIN_PASSWORD ?? "");

        if (allowDefaultAdmin && email === masterAdminEmail && masterAdminPassword) {
          const existing = await prisma.user.findUnique({ where: { email } });

          if (!existing) {
            if (password !== masterAdminPassword) return null;
            const created = await prisma.user.create({
              data: {
                email,
                name: "Master Admin",
                role: "ADMIN",
                passwordHash: await bcrypt.hash(masterAdminPassword, 10),
              },
            });
            return authUser(created);
          }

          const storedHash = existing.passwordHash ? String(existing.passwordHash) : "";
          const okPlain = password === masterAdminPassword;
          const okHash = storedHash ? await bcrypt.compare(password, storedHash) : false;
          if (!okPlain && !okHash) return null;

          if (existing.role !== "ADMIN") {
            const updated = await prisma.user.update({
              where: { id: existing.id },
              data: { role: "ADMIN" },
            });
            return authUser(updated);
          }
          return authUser(existing);
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;
        const ok = await bcrypt.compare(password, user.passwordHash ?? "");
        if (!ok) return null;
        return authUser(user);
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        (token as any).id = (user as any).id;
        (token as any).role = (user as any).role;
        (token as any).isDraftCoach = !!(user as any).isDraftCoach;
        (token as any).coachDivision = (user as any).coachDivision ?? null;
        (token as any).coachesU11 = !!(user as any).coachesU11;
        (token as any).coachesU13 = !!(user as any).coachesU13;
        (token as any).isViewer = !!(user as any).isViewer;
      } else if ((token as any).email) {
        const email = normEmail((token as any).email);
        if (email) {
          const dbUser = await prisma.user.findUnique({
            where: { email },
            select: {
              id: true,
              role: true,
              isDraftCoach: true,
              coachDivision: true,
              coachesU11: true,
              coachesU13: true,
              isViewer: true,
            },
          });
          if (dbUser) {
            (token as any).id = dbUser.id;
            (token as any).role = dbUser.role;
            (token as any).isDraftCoach = dbUser.isDraftCoach;
            (token as any).coachDivision = dbUser.coachDivision;
            (token as any).coachesU11 = dbUser.coachesU11;
            (token as any).coachesU13 = dbUser.coachesU13;
            (token as any).isViewer = dbUser.isViewer;
          }
        }
      }
      return token;
    },

    async session({ session, token }) {
      (session.user as any).id = (token as any).id;
      (session.user as any).role = (token as any).role;
      (session.user as any).isDraftCoach = !!(token as any).isDraftCoach;
      (session.user as any).coachDivision = (token as any).coachDivision ?? null;
      (session.user as any).coachesU11 = !!(token as any).coachesU11;
      (session.user as any).coachesU13 = !!(token as any).coachesU13;
      (session.user as any).isViewer = !!(token as any).isViewer;
      return session;
    },
  },
};
