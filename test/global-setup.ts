import { execSync } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';

// recria o banco de teste do zero antes de rodar os e2e
export default async function globalSetup(): Promise<void> {
  const arquivo = join(__dirname, '..', 'prisma', 'test.db');
  for (const f of [arquivo, `${arquivo}-journal`]) if (existsSync(f)) rmSync(f);

  const env = { ...process.env, DATABASE_URL: 'file:./test.db', BCRYPT_ROUNDS: '4' };
  execSync('npx prisma migrate deploy', { stdio: 'ignore', env });
  execSync('npx prisma db seed', { stdio: 'ignore', env });
}
