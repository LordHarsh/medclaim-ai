import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { auth } from "@/lib/auth/server";

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const CLASSIFICATION_PROMPT = `Classify this Indian medical document. Return ONLY one of these exact values:
PRESCRIPTION, HOSPITAL_BILL, LAB_REPORT, PHARMACY_BILL, UNKNOWN

Rules:
- PRESCRIPTION: Doctor's handwritten or printed Rx with patient name, diagnosis, medicines
- HOSPITAL_BILL: Invoice/bill from hospital or clinic with itemized charges and amounts
- LAB_REPORT: Diagnostic test results (blood tests, MRI reports, X-ray reports)
- PHARMACY_BILL: Medicine purchase receipt from a pharmacy
- UNKNOWN: Cannot determine type

Return JSON: {"type": "PRESCRIPTION", "confidence": 0.95}`;

export async function POST(request: NextRequest) {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { s3_key?: string; content_type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { s3_key, content_type } = body;
  if (!s3_key || !content_type) {
    return NextResponse.json(
      { error: "Missing required fields: s3_key, content_type" },
      { status: 400 }
    );
  }

  try {
    // Generate a presigned GET URL for the S3 object
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: s3_key,
    });
    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });

    // Fetch the image bytes from the presigned URL
    const imageResponse = await fetch(presignedUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image from S3: ${imageResponse.status}`);
    }
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Data = Buffer.from(imageBuffer).toString("base64");

    // Determine the MIME type to pass to Gemini (PDFs aren't inline images — use jpeg fallback)
    const mimeType = content_type.startsWith("image/") ? content_type : "image/jpeg";

    // Call Gemini for classification
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: mimeType as "image/jpeg" | "image/png" | "image/webp",
          data: base64Data,
        },
      },
      CLASSIFICATION_PROMPT,
    ]);

    const text = result.response.text().trim();

    // Extract the JSON from the response (handle markdown code blocks if present)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ detected_type: "UNKNOWN", confidence: 0 });
    }

    const parsed = JSON.parse(jsonMatch[0]) as { type?: string; confidence?: number };
    const validTypes = ["PRESCRIPTION", "HOSPITAL_BILL", "LAB_REPORT", "PHARMACY_BILL", "UNKNOWN"];
    const detected_type = validTypes.includes(parsed.type ?? "") ? (parsed.type ?? "UNKNOWN") : "UNKNOWN";
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;

    return NextResponse.json({ detected_type, confidence });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Classification failed";
    console.error("[classify-document] Error:", message, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
