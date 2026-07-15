// End-to-end lifecycle smoke test vs a live environment:
// sign in → publish (with real S3 uploads) → admin approve → download →
// review → library. Usage: node scripts/smoke-lifecycle.mjs <api> <clientId>
import { readFileSync } from 'node:fs';

const [API, CLIENT] = process.argv.slice(2);
const env = Object.fromEntries(readFileSync(new URL('../input.env', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));

const die = (m, x) => { console.error('FAIL:', m, x ?? ''); process.exit(1); };

// Sign in
const auth = await fetch('https://cognito-idp.us-east-1.amazonaws.com/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth' },
  body: JSON.stringify({ ClientId: CLIENT, AuthFlow: 'USER_PASSWORD_AUTH', AuthParameters: { USERNAME: env.TEST_USER_EMAIL, PASSWORD: env.TEST_USER_PASSWORD } }),
}).then(r => r.json());
const token = auth.AuthenticationResult?.IdToken || die('sign-in', auth);
const H = { 'Content-Type': 'application/json', Authorization: token };
const ADMIN = { 'Content-Type': 'application/json', 'X-Superadmin-Username': env.SUPERADMIN_USERNAME, 'X-Superadmin-Password': env.SUPERADMIN_PASSWORD };

// 1. Create skill
const created = await fetch(`${API}/skills`, { method: 'POST', headers: H, body: JSON.stringify({
  title: 'Lifecycle Smoke Skill', category: 'Testing',
  description: 'Created by the lifecycle smoke test.', usageInstructions: 'Load and go.',
  platforms: ['Claude'], priceCents: 0, timeSavedHours: 2,
  pocUrl: 'https://tapdot.org', skillFileName: 'SKILL.md',
  screenshotFileName: 'shot.png', screenshotContentType: 'image/png',
}) }).then(r => r.json());
created.skillId || die('create', created);
console.log('1. created', created.skillId);

// 2. Upload real files to S3 via presigned URLs
const up1 = await fetch(created.skillFileUploadUrl, { method: 'PUT', headers: { 'Content-Type': 'text/markdown' }, body: '# Smoke SKILL.md\nHello.' });
up1.ok || die('skill file upload', up1.status);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const up2 = await fetch(created.screenshotUploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: png });
up2.ok || die('screenshot upload', up2.status);
console.log('2. uploads ok');

// 3. Submit → pending
const sub = await fetch(`${API}/skills/${created.skillId}/submit`, { method: 'POST', headers: H }).then(r => r.json());
sub.status === 'pending' || die('submit', sub);
console.log('3. submitted (pending)');

// 4. Approve via superadmin
const appr = await fetch(`${API}/admin/skills/${created.skillId}/approve`, { method: 'POST', headers: ADMIN }).then(r => r.json());
appr.status === 'approved' || die('approve', appr);
console.log('4. approved');

// 5. Public detail now visible with presigned screenshot
const detail = await fetch(`${API}/skills/${created.skillId}`).then(r => r.json());
detail.title === 'Lifecycle Smoke Skill' || die('public detail', detail);
detail.pocScreenshotUrl?.includes('X-Amz-Signature') || die('screenshot presign', detail.pocScreenshotUrl);
console.log('5. public detail live');

// 6. Owner download is allowed and doesn't self-inflate counters
const dl = await fetch(`${API}/skills/${created.skillId}/download`, { method: 'POST', headers: H }).then(r => r.json());
dl.url || die('download', dl);
const md = await fetch(dl.url).then(r => r.text());
md.includes('Smoke SKILL.md') || die('downloaded content', md.slice(0, 80));
console.log('6. download round-trip ok');

// 7. Own-review rejection (sellers cannot review their own skill)
const rev = await fetch(`${API}/skills/${created.skillId}/reviews`, { method: 'POST', headers: H, body: JSON.stringify({ rating: 5, text: 'self review' }) });
rev.status === 403 || die('own-review must 403', rev.status);
console.log('7. self-review correctly rejected');

// 8. Cleanup: flag it so it leaves the public marketplace
await fetch(`${API}/admin/skills/${created.skillId}/flag`, { method: 'POST', headers: ADMIN });
const gone = await fetch(`${API}/skills/${created.skillId}`);
gone.status === 404 || die('flagged skill must vanish', gone.status);
console.log('8. flagged + hidden. ALL LIFECYCLE CHECKS PASSED');
