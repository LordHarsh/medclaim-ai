import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { generatePresignedUploadUrl } from "@/lib/s3";

export async function GET(request: NextRequest) {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const claimId = searchParams.get("claim_id");
  const filename = searchParams.get("filename");
  const contentType = searchParams.get("content_type");
  const sizeBytes = parseInt(searchParams.get("size_bytes") || "0");

  if (!claimId || !filename || !contentType || !sizeBytes) {
    return NextResponse.json(
      { error: "Missing required parameters: claim_id, filename, content_type, size_bytes" },
      { status: 400 }
    );
  }

  try {
    const { presignedUrl, s3Key } = await generatePresignedUploadUrl({
      claimId,
      filename,
      contentType,
      sizeBytes,
    });

    return NextResponse.json({
      presigned_url: presignedUrl,
      s3_key: s3Key,
      expires_in: 300,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate upload URL";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
