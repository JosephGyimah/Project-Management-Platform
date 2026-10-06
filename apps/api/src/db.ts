import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlDirectory = path.resolve(__dirname, '../sql');

export const createPool = (): Pool =>
  new Pool({
    connectionString: process.env.DATABASE_URL ?? '******localhost:5432/pmp'
  });

export const runMigrations = async (pool: Pool): Promise<void> => {
  const files = (await readdir(sqlDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    const sql = await readFile(path.join(sqlDirectory, file), 'utf8');
    await pool.query(sql);
  }
};
