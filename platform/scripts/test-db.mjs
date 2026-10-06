// Runs the database tests (tests/db) against a throwaway local Postgres.
// They delete every row, so this refuses any database that isn't on this machine.
//
//   TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/toropay_test npm run test:db
//
// The tables are built from prisma/schema.prisma and filled with made-up data:
// production data is never used.
import { execSync } from 'node:child_process'

const url = process.env.TEST_DATABASE_URL
if (!url) {
  console.error('Set TEST_DATABASE_URL to a throwaway local Postgres, e.g. postgresql://postgres:postgres@127.0.0.1:5432/toropay_test')
  process.exit(1)
}
const { hostname } = new URL(url)
if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
  console.error(`Refusing to run: the database tests delete data, and ${hostname} is not a local database.`)
  process.exit(1)
}

const env = { ...process.env, DATABASE_URL: url }
execSync('npx prisma db push --force-reset --accept-data-loss --skip-generate', { stdio: 'inherit', env })
execSync('npx vitest run --config vitest.db.config.ts', { stdio: 'inherit', env })
