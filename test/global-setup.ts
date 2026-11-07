import { execSync } from 'child_process';

// recria o banco de teste do zero antes de rodar os e2e
export default async function globalSetup(): Promise<void> {
  execSync('npx prisma migrate reset --force --skip-generate', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: 'file:./test.db', BCRYPT_ROUNDS: '4' },
  });
}
