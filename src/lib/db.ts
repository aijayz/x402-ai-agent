// src/lib/db.ts
import { neon } from "@neondatabase/serverless";
import { env } from "./env";

// Neon's serverless driver returns a SQL tagged template function.
// Each call opens a fresh HTTP connection — no pool to manage.
export const sql = neon(env.DATABASE_URL);
