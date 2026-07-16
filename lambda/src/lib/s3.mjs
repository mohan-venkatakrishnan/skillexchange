import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({});
export const BUCKET = process.env.BUCKET;

export function skillFileKey(skillId) { return `skills/${skillId}/SKILL.md`; }
export function screenshotKey(skillId, ext) { return `screenshots/${skillId}.${ext}`; }
export function avatarKey(userId, ext) { return `avatars/${userId}.${ext}`; }

export function presignPut(key, contentType, expiresIn = 300) {
  return getSignedUrl(s3, new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }), { expiresIn });
}

export function presignGet(key, expiresIn = 300) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
}

/* Presigned GET that DOWNLOADS instead of rendering.
   S3 serves SKILL.md as text/markdown, which browsers display inline — so the
   Download button just navigated to a wall of text with a giant signed URL in
   the address bar. The <a download> attribute can't override it either: that
   attribute is ignored cross-origin, and S3 is a different origin. The only
   thing that works is telling S3 itself to send Content-Disposition, which it
   will do via ResponseContentDisposition on the signed URL. */
export function presignDownload(key, filename, expiresIn = 300) {
  // RFC 5987: quote the ASCII fallback, and add filename* for anything else.
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  const disposition = `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
  return getSignedUrl(s3, new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ResponseContentDisposition: disposition,
    ResponseContentType: 'text/markdown; charset=utf-8',
  }), { expiresIn });
}
