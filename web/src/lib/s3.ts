import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function generatePresignedUploadUrl(params: {
  claimId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}) {
  const { claimId, filename, contentType, sizeBytes } = params;

  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    throw new Error(
      `Invalid content type: ${contentType}. Allowed: ${ALLOWED_CONTENT_TYPES.join(", ")}`
    );
  }

  if (sizeBytes > MAX_FILE_SIZE) {
    throw new Error(
      `File too large: ${sizeBytes} bytes. Maximum: ${MAX_FILE_SIZE} bytes (10MB)`
    );
  }

  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const timestamp = Date.now();
  const s3Key = `claims/${claimId}/${timestamp}_${sanitizedFilename}`;

  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME!,
    Key: s3Key,
    ContentType: contentType,
    ContentLength: sizeBytes,
  });

  const presignedUrl = await getSignedUrl(s3Client, command, {
    expiresIn: 300,
  });

  return { presignedUrl, s3Key };
}
