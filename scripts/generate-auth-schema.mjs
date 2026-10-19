import { DatabaseSync } from 'node:sqlite';
import { getMigrations } from 'better-auth/db/migration';
import { writeFileSync } from 'node:fs';
const options = {
 database:new DatabaseSync(':memory:'),
 emailAndPassword:{enabled:true},user:{modelName:'auth_user'},session:{modelName:'auth_session'},
 account:{modelName:'auth_account',accountLinking:{enabled:false}},verification:{modelName:'auth_verification'},
 rateLimit:{enabled:true,storage:'database',modelName:'auth_rate_limit'},
};
const migration=await getMigrations(options);
writeFileSync('worker/auth-migrations/0001_accounts.sql',await migration.compileMigrations());
console.log('Generated account-only schema from installed Better Auth version.');
