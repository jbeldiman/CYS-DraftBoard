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

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,

  adapter: PrismaAdapter(prisma),

  session: {
    strategy: "jwt",
  },

  pages: {
    signIn: "/login",
  },

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
            const ok = password === masterAdminPassword;
            if (!ok) return null;

            const created = await prisma.user.create({
              data: {
                email,
                name: "Master Admin",
                role: "ADMIN",
                passwordHash: await bcrypt.hash(masterAdminPassword, 10),
              },
            });

            return { id: created.id, email: created.email, name: created.name, role: created.role } as any;
          }

          const storedHash = (existing as any).passwordHash ? String((existing as any).passwordHash) : "";
          const okPlain = password === masterAdminPassword;
          const okHash = storedHash ? await bcrypt.compare(password, storedHash) : false;

          if (!okPlain && !okHash) return null;

          if (existing.role !== "ADMIN") {
            const updated = await prisma.user.update({
              where: { id: existing.id },
              data: { role: "ADMIN" },
            });
            return { id: updated.id, email: updated.email, name: updated.name, role: updated.role } as any;
          }

          return { id: existing.id, email: existing.email, name: existing.name, role: existing.role } as any;
        }

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) return null;

        const ok = await bcrypt.compare(password, (user as any).passwordHash ?? "");
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        } as any;
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        (token as any).id = (user as any).id;
        (token as any).role = (user as any).role;
      } else if ((!(token as any).id || !(token as any).role) && (token as any).email) {
        const email = normEmail((token as any).email);
        if (email) {
          const dbUser = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
          if (dbUser) {
            (token as any).id = dbUser.id;
            (token as any).role = dbUser.role;
          }
        }
      }
      return token;
    },

    async session({ session, token }) {
      (session.user as any).id = (token as any).id;
      (session.user as any).role = (token as any).role;
      return session;
    },
  },
};
