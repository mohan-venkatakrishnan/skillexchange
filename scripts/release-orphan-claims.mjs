// Release USERNAME# claims that no user actually owns.
//
// PreSignUp used to reserve a handle unconditionally, with no rollback if the
// signup then failed (e.g. duplicate email). Those reservations are stranded:
// userId is null, so nobody owns them and nobody can ever take them. This
// finds and frees them. New reservations carry a TTL and can be taken over
// once stale, so this is a one-off repair for claims made before that fix.
//
// Usage: node scripts/release-orphan-claims.mjs <table> [--apply]
import { readFileSync } from 'node:fs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const TABLE = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!TABLE) { console.error('usage: node scripts/release-orphan-claims.mjs <table> [--apply]'); process.exit(1); }

const env = Object.fromEntries(readFileSync(new URL('../input.env', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));

const db = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: 'us-east-1',
  credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
}));

const orphans = [];
let ExclusiveStartKey;
do {
  const r = await db.send(new ScanCommand({
    TableName: TABLE,
    FilterExpression: 'SK = :sk AND begins_with(PK, :pk) AND attribute_type(userId, :nullType)',
    ExpressionAttributeValues: { ':sk': 'CLAIM', ':pk': 'USERNAME#', ':nullType': 'NULL' },
    ExclusiveStartKey,
  }));
  orphans.push(...(r.Items || []));
  ExclusiveStartKey = r.LastEvaluatedKey;
} while (ExclusiveStartKey);

if (!orphans.length) { console.log('no unbound claims — nothing to do'); process.exit(0); }

/* CRITICAL: "unbound" != "unused". AdminCreateUser fires PreSignUp (which
   reserves) but NOT PostConfirmation (which binds), so a perfectly real
   account — the CI test user, for one — can hold an unbound claim. Deleting
   that would hand a live user's handle to the next person who asks for it.
   So: if a PROFILE already uses the handle, BIND the claim to that user.
   Only genuinely unused reservations get released. */
const profiles = [];
let PStart;
do {
  const r = await db.send(new ScanCommand({
    TableName: TABLE,
    FilterExpression: 'SK = :sk AND begins_with(PK, :pk)',
    ExpressionAttributeValues: { ':sk': 'PROFILE', ':pk': 'USER#' },
    ProjectionExpression: 'userId, username',
    ExclusiveStartKey: PStart,
  }));
  profiles.push(...(r.Items || []));
  PStart = r.LastEvaluatedKey;
} while (PStart);
const byUsername = new Map(profiles.map(p => [p.username, p.userId]));

const toBind = [];
const toRelease = [];
for (const o of orphans) {
  const handle = o.PK.replace('USERNAME#', '');
  const owner = byUsername.get(handle);
  (owner ? toBind : toRelease).push({ ...o, handle, owner });
}

console.log(`${orphans.length} unbound claim(s):`);
for (const o of toBind) console.log(`  BIND    @${o.handle} -> ${o.owner} (a real profile uses this handle)`);
for (const o of toRelease) console.log(`  RELEASE @${o.handle} (reserved ${o.claimedAt} by ${o.email || '?'}, no profile — signup never completed)`);

if (!APPLY) { console.log('\ndry run — pass --apply'); process.exit(0); }

for (const o of toBind) {
  await db.send(new UpdateCommand({
    TableName: TABLE,
    Key: { PK: o.PK, SK: 'CLAIM' },
    UpdateExpression: 'SET userId = :u REMOVE expiresAt',
    ConditionExpression: 'attribute_type(userId, :nullType)',
    ExpressionAttributeValues: { ':u': o.owner, ':nullType': 'NULL' },
  })).then(
    () => console.log('bound   @' + o.handle),
    e => console.log('skipped @' + o.handle, '-', e.name),
  );
}
for (const o of toRelease) {
  // Guard against a race: only delete if it is STILL unbound.
  await db.send(new DeleteCommand({
    TableName: TABLE,
    Key: { PK: o.PK, SK: 'CLAIM' },
    ConditionExpression: 'attribute_type(userId, :nullType)',
    ExpressionAttributeValues: { ':nullType': 'NULL' },
  })).then(
    () => console.log('released @' + o.handle),
    e => console.log('skipped  @' + o.handle, '-', e.name),
  );
}
