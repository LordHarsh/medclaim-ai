#!/usr/bin/env node

/**
 * Generate test medical document images using Google Gemini's Imagen API.
 *
 * Reads prompts from resources/document_prompts.json and generates images
 * saving them to resources/test_documents/{case_id}/{file_name}.
 *
 * Usage:
 *   node scripts/generate-test-documents.js
 *   npm run generate-docs
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("ERROR: GEMINI_API_KEY not found in .env file");
  process.exit(1);
}

const PROMPTS_FILE = path.resolve(__dirname, "..", "resources", "document_prompts.json");
const OUTPUT_DIR = path.resolve(__dirname, "..", "resources", "test_documents");
const DELAY_MS = 3000; // 3 seconds between API calls

// Models (verified available)
const IMAGEN_MODEL = "imagen-4.0-fast-generate-001";
const GEMINI_IMAGE_MODEL = "gemini-3-pro-image";

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Make an HTTPS request and return the response body as a string.
 */
function httpsRequest(url, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestBody = JSON.stringify(body);

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(requestBody),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve({ statusCode: res.statusCode, body: data });
      });
    });

    req.on("error", (e) => {
      reject(new Error(`Network error: ${e.message}`));
    });

    req.write(requestBody);
    req.end();
  });
}

/**
 * Generate an image using Imagen 4.0 Fast via the predict endpoint.
 * Returns base64-encoded image data (JPEG).
 */
async function generateWithImagen(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict?key=${API_KEY}`;

  const response = await httpsRequest(url, {
    instances: [{ prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio: "3:4",
    },
  });

  if (response.statusCode !== 200) {
    throw new Error(`Imagen API status ${response.statusCode}: ${response.body.substring(0, 200)}`);
  }

  const parsed = JSON.parse(response.body);
  if (
    parsed.predictions &&
    parsed.predictions.length > 0 &&
    parsed.predictions[0].bytesBase64Encoded
  ) {
    return { data: parsed.predictions[0].bytesBase64Encoded, format: "jpeg" };
  }

  throw new Error(
    `Unexpected Imagen response: ${JSON.stringify(parsed).substring(0, 300)}`
  );
}

/**
 * Generate an image using Gemini 2.5 Flash Image via generateContent.
 * Returns base64-encoded image data (PNG or JPEG depending on model response).
 */
async function generateWithGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${API_KEY}`;

  const response = await httpsRequest(url, {
    contents: [
      {
        parts: [
          {
            text: `Generate a realistic photograph of the following document. Image only, no watermarks:\n\n${prompt}`,
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["image", "text"],
    },
  });

  if (response.statusCode !== 200) {
    throw new Error(`Gemini API status ${response.statusCode}: ${response.body.substring(0, 200)}`);
  }

  const parsed = JSON.parse(response.body);
  const candidates = parsed.candidates;
  if (candidates && candidates.length > 0) {
    const parts = candidates[0].content?.parts || [];
    for (const part of parts) {
      if (part.inlineData && part.inlineData.data) {
        const mimeType = part.inlineData.mimeType || "image/png";
        const format = mimeType.includes("jpeg") || mimeType.includes("jpg") ? "jpeg" : "png";
        return { data: part.inlineData.data, format };
      }
    }
  }

  throw new Error(
    `No image in Gemini response: ${JSON.stringify(parsed).substring(0, 300)}`
  );
}

/**
 * Try Imagen 4.0 Fast first, fall back to Gemini 2.5 Flash Image.
 */
async function generateImageWithFallback(prompt) {
  try {
    return await generateWithGemini(prompt);
  } catch (imagenError) {
    console.log(
      `    Imagen failed (${imagenError.message.substring(0, 80)}), trying Imagen fallback...`
    );
    return await generateWithImagen(prompt);
  }
}

async function main() {
  console.log("=== Medical Document Image Generator ===");
  console.log(`Primary model: ${IMAGEN_MODEL}`);
  console.log(`Fallback model: ${GEMINI_IMAGE_MODEL}\n`);

  // Read prompts file
  if (!fs.existsSync(PROMPTS_FILE)) {
    console.error(`ERROR: Prompts file not found: ${PROMPTS_FILE}`);
    process.exit(1);
  }

  const promptsData = JSON.parse(fs.readFileSync(PROMPTS_FILE, "utf-8"));
  const testCases = promptsData.test_cases;

  // Count total documents
  let totalDocs = 0;
  for (const tc of testCases) {
    totalDocs += tc.documents.length;
  }

  console.log(`Found ${testCases.length} test cases with ${totalDocs} documents to generate.\n`);

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let current = 0;
  let successCount = 0;
  let failCount = 0;
  const failures = [];

  for (const testCase of testCases) {
    const caseDir = path.join(OUTPUT_DIR, testCase.case_id);
    fs.mkdirSync(caseDir, { recursive: true });

    for (const doc of testCase.documents) {
      current++;
      const outputPath = path.join(caseDir, doc.file_name);

      // Skip if file already exists
      if (fs.existsSync(outputPath)) {
        console.log(
          `[${current}/${totalDocs}] ${testCase.case_id}/${doc.file_id} — SKIPPED (already exists)`
        );
        successCount++;
        continue;
      }

      console.log(
        `[${current}/${totalDocs}] Generating ${testCase.case_id}/${doc.file_id} (${doc.file_name})...`
      );

      try {
        const result = await generateImageWithFallback(doc.prompt);

        // Write the image file (always save as .jpg since filenames end in .jpg)
        const imageBuffer = Buffer.from(result.data, "base64");
        fs.writeFileSync(outputPath, imageBuffer);

        const fileSizeKB = (imageBuffer.length / 1024).toFixed(1);
        console.log(`    SUCCESS — saved ${fileSizeKB} KB (${result.format})`);
        successCount++;
      } catch (error) {
        console.error(`    FAILED — ${error.message.substring(0, 150)}`);
        failCount++;
        failures.push({
          case_id: testCase.case_id,
          file_id: doc.file_id,
          file_name: doc.file_name,
          error: error.message,
        });
      }

      // Delay between calls to avoid rate limiting
      if (current < totalDocs) {
        process.stdout.write(`    Waiting ${DELAY_MS / 1000}s before next request...\r`);
        await sleep(DELAY_MS);
        console.log(`    Waited ${DELAY_MS / 1000}s. Continuing...`);
      }
      console.log("");
    }
  }

  // Summary
  console.log("=== Generation Complete ===");
  console.log(`  Success: ${successCount}/${totalDocs}`);
  console.log(`  Failed:  ${failCount}/${totalDocs}`);

  if (failures.length > 0) {
    console.log("\nFailed documents:");
    for (const f of failures) {
      console.log(`  - ${f.case_id}/${f.file_id} (${f.file_name}): ${f.error.substring(0, 100)}`);
    }
  }

  console.log(`\nOutput directory: ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
