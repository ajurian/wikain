/**
 * BetterAuth's core tables (STACK-4), hand-declared in Drizzle so `drizzle-kit` (which reads
 * `schema.ts`), the pglite test migrator, AND the `drizzleAdapter` all see one schema. The columns +
 * JS property names mirror BetterAuth's own model (`getAuthTables`) exactly — the adapter maps by the
 * Drizzle *property* key (camelCase: `emailVerified`, `userId`, …), so those must not be renamed; the
 * SQL column names (snake_case) are free.
 *
 * `id` is `uuid` on every table: BetterAuth is configured with `advanced.database.generateId: "uuid"`
 * (see `auth/auth.ts`), so it supplies a v4 uuid string on insert — Postgres stores it natively and the
 * app tables' `user_id` (schema.ts) is the same `uuid` type. No DB-side `gen_random_uuid()` default is
 * needed (keeps pglite free of a pgcrypto dependency). FKs live only inside this auth cluster
 * (session/account → user, cascade); the app tables stay FK-less by convention.
 */
import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const user = pgTable("user", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: ts("created_at").notNull(),
  updatedAt: ts("updated_at").notNull(),
});

export const session = pgTable("session", {
  id: uuid("id").primaryKey(),
  expiresAt: ts("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: ts("created_at").notNull(),
  updatedAt: ts("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: uuid("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: ts("access_token_expires_at"),
  refreshTokenExpiresAt: ts("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: ts("created_at").notNull(),
  updatedAt: ts("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: uuid("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at").notNull(),
  updatedAt: ts("updated_at").notNull(),
});
