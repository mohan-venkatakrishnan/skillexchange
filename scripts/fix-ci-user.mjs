// Remove the CI test user that was created with the founder's REAL email, and
// recreate it on a +ci alias. Two Cognito users sharing one email is the
// "one identity can be many accounts" trap: email is not a primary key, and
// here it let an email/password sign-in land on the CI account instead of the
// founder's Google identity.
//
// Usage: node scripts/fix-ci-user.mjs <pool-id> <table>
import { readFileSync } from 'node:fs';
import { CognitoIdentityProviderClient, AdminDeleteUserCommand, AdminCreateUserCommand, AdminSetUserPasswordCommand } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const [POOL, TABLE] = process.argv.slice(2);
if (!POOL || !TABLE) { console.error('usage: node scripts/fix-ci-user.mjs <pool-id> <table>'); process.exit(1); }

const env = Object.fromEntries(readFileSync(new URL('../input.env', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const creds = { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY };
const idp = new CognitoIdentityProviderClient({ region: 'us-east-1', credentials: creds });
const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1', credentials: creds }));

const REAL_EMAIL = env.TEST_USER_EMAIL;              // rkmohanchn@gmail.com
const CI_EMAIL = REAL_EMAIL.replace('@', '+ci@');    // rkmohanchn+ci@gmail.com
const CI_HANDLE = 'ci_testrunner';

// 1. Delete the old CI Cognito user (the one holding the real email)
const scan = await db.send(new ScanCommand({
  TableName: TABLE,
  FilterExpression: 'SK = :sk AND username = :u',
  ExpressionAttributeValues: { ':sk': 'PROFILE', ':u': CI_HANDLE },
}));
for (const p of scan.Items || []) {
  try {
    await idp.send(new AdminDeleteUserCommand({ UserPoolId: POOL, Username: REAL_EMAIL }));
    console.log('deleted cognito user holding', REAL_EMAIL);
  } catch (e) { console.log('cognito delete:', e.name); }
  await db.send(new DeleteCommand({ TableName: TABLE, Key: { PK: p.PK, SK: 'PROFILE' } }));
  await db.send(new DeleteCommand({ TableName: TABLE, Key: { PK: `USERNAME#${CI_HANDLE}`, SK: 'CLAIM' } }));
  console.log('removed profile + username claim for', CI_HANDLE);
}

// 2. Recreate CI user on the alias so prod auth stays covered
await idp.send(new AdminCreateUserCommand({
  UserPoolId: POOL, Username: CI_EMAIL,
  UserAttributes: [
    { Name: 'email', Value: CI_EMAIL },
    { Name: 'email_verified', Value: 'true' },
    { Name: 'name', Value: 'CI Test Runner' },
    { Name: 'custom:username', Value: CI_HANDLE },
  ],
  MessageAction: 'SUPPRESS',
})).catch(e => console.log('create:', e.name));
await idp.send(new AdminSetUserPasswordCommand({
  UserPoolId: POOL, Username: CI_EMAIL, Password: env.TEST_USER_PASSWORD, Permanent: true,
}));
console.log('recreated CI user as', CI_EMAIL);
console.log(`\nACTION: set the TEST_USER_EMAIL GitHub secret to ${CI_EMAIL}`);
