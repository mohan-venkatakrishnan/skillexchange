import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({});
export const BUCKET = process.env.BUCKET;

export function skillFileKey(skillId) { return `skills/${skillId}/SKILL.md`; }
export function screenshotKey(skillId, ext) { return `screenshots/${skillId}.${ext}`; }

export function presignPut(key, contentType, expiresIn = 300) {
  return getSignedUrl(s3, new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }), { expiresIn });
}

export function presignGet(key, expiresIn = 300) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
}
