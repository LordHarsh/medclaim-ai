/**
 * Upload Test Documents to S3
 *
 * This script uploads all 24 test document images from resources/test_documents/
 * to the S3 bucket under the `test-cases/` prefix.
 *
 * Prerequisites:
 *   - AWS credentials must be available via environment variables or ~/.aws/credentials
 *   - The S3_BUCKET_NAME environment variable should be set (defaults to "medclaim-docs-prod")
 *
 * Usage:
 *   export AWS_ACCESS_KEY_ID=<your-key>
 *   export AWS_SECRET_ACCESS_KEY=<your-secret>
 *   export AWS_REGION=ap-south-1
 *   npm run upload-test-docs
 *
 * Or if you have ~/.aws/credentials configured, just:
 *   npm run upload-test-docs
 */

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require("fs");
const path = require("path");

const BUCKET_NAME = process.env.S3_BUCKET_NAME || "medclaim-docs-prod";
const REGION = process.env.AWS_REGION || "ap-south-1";
const TEST_DOCS_DIR = path.resolve(__dirname, "../resources/test_documents");
const OUTPUT_PATH = path.resolve(
  __dirname,
  "../resources/test_documents_s3_keys.json"
);

// File ID counter — generates sequential IDs across all test cases
let fileIdCounter = 1;

function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

async function main() {
  const s3Client = new S3Client({ region: REGION });

  // Read all TC directories
  const tcDirs = fs
    .readdirSync(TEST_DOCS_DIR)
    .filter((name) => name.startsWith("TC"))
    .sort();

  if (tcDirs.length === 0) {
    console.error("No TC directories found in", TEST_DOCS_DIR);
    process.exit(1);
  }

  const mapping = {};
  let totalUploaded = 0;

  for (const tcDir of tcDirs) {
    const caseId = tcDir; // e.g., "TC001"
    const tcPath = path.join(TEST_DOCS_DIR, tcDir);

    if (!fs.statSync(tcPath).isDirectory()) continue;

    const files = fs
      .readdirSync(tcPath)
      .filter((f) => {
        const ext = path.extname(f).toLowerCase();
        return [".jpg", ".jpeg", ".png", ".webp", ".pdf"].includes(ext);
      })
      .sort();

    mapping[caseId] = [];

    for (const file of files) {
      const fileId = `F${String(fileIdCounter).padStart(3, "0")}`;
      fileIdCounter++;

      const s3Key = `test-cases/${caseId}/${file}`;
      const filePath = path.join(tcPath, file);
      const fileBuffer = fs.readFileSync(filePath);
      const contentType = getContentType(file);

      console.log(`Uploading: ${s3Key} (${contentType}, ${fileBuffer.length} bytes)`);

      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: contentType,
      });

      await s3Client.send(command);
      totalUploaded++;

      mapping[caseId].push({
        file_id: fileId,
        file_name: file,
        s3_key: s3Key,
      });
    }
  }

  // Write the mapping file
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(mapping, null, 2));
  console.log(`\nDone! Uploaded ${totalUploaded} files across ${tcDirs.length} test cases.`);
  console.log(`Mapping saved to: ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("Upload failed:", err);
  process.exit(1);
});
