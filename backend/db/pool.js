import pkg from "pg";
import { DATABASE_URL } from "../config/env.js";

const { Pool } = pkg;

export const pool = new Pool({ connectionString: DATABASE_URL });

