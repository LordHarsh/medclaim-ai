"use client";

/**
 * One upload slot per document the claim needs. A file goes straight to storage through a presigned URL, then a
 * quick classifier says what kind of document it looks like, so a wrong upload is caught before the claim is sent.
 */
import { useState, useCallback } from "react";
import { Check, FileUp, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { cx } from "@/components/ui";

type ClassificationStatus = "idle" | "classifying" | "done" | "error";

interface ClassificationResult {
  detected_type: string;
  confidence: number;
}

interface SingleDocUploadProps {
  claimId: string;
  docType: string;
  label: string;
  required: boolean;
  onUploadComplete: (docType: string, s3Key: string) => void;
  onRemove: (docType: string) => void;
  onClassificationChange?: (docType: string, status: "classifying" | "matched" | "mismatched" | "error") => void;
  currentFile?: { name: string; size: number; s3Key: string } | null;
}

const VALID_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_SIZE = 10 * 1024 * 1024;

export function SingleDocUpload({
  claimId,
  docType,
  label,
  required,
  onUploadComplete,
  onRemove,
  onClassificationChange,
  currentFile,
}: SingleDocUploadProps) {
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">(currentFile ? "success" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [classificationStatus, setClassificationStatus] = useState<ClassificationStatus>("idle");
  const [classification, setClassification] = useState<ClassificationResult | null>(null);

  const classifyDocument = useCallback(
    async (s3Key: string, contentType: string) => {
      setClassificationStatus("classifying");
      setClassification(null);
      onClassificationChange?.(docType, "classifying");
      try {
        const res = await fetch("/api/classify-document", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ s3_key: s3Key, content_type: contentType }),
        });
        if (!res.ok) {
          setClassificationStatus("error");
          onClassificationChange?.(docType, "error");
          return;
        }
        const data = (await res.json()) as ClassificationResult;
        setClassification(data);
        setClassificationStatus("done");
        const matched = data.detected_type === docType;
        onClassificationChange?.(docType, matched ? "matched" : "mismatched");
      } catch {
        setClassificationStatus("error");
        onClassificationChange?.(docType, "error");
      }
    },
    [docType, onClassificationChange],
  );

  const uploadFile = useCallback(
    async (file: File) => {
      if (!VALID_TYPES.includes(file.type)) {
        setStatus("error");
        setError("Use a JPEG, PNG, WebP or PDF.");
        return;
      }
      if (file.size > MAX_SIZE) {
        setStatus("error");
        setError("Too large. The limit is 10 MB.");
        return;
      }

      setStatus("uploading");
      setError(null);
      setClassificationStatus("idle");
      setClassification(null);

      try {
        const params = new URLSearchParams({
          claim_id: claimId,
          filename: `${docType}_${file.name}`,
          content_type: file.type,
          size_bytes: file.size.toString(),
        });

        const response = await fetch(`/api/upload-url?${params}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to get upload URL");
        }

        const uploadResponse = await fetch(data.presigned_url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });

        if (!uploadResponse.ok) {
          throw new Error("Upload failed");
        }

        setStatus("success");
        onUploadComplete(docType, data.s3_key);
        // Classify after upload: fire and forget (non-blocking)
        classifyDocument(data.s3_key, file.type);
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Upload failed");
      }
    },
    [claimId, docType, onUploadComplete, classifyDocument],
  );

  const handleRemove = () => {
    setStatus("idle");
    setError(null);
    setClassificationStatus("idle");
    setClassification(null);
    onRemove(docType);
  };

  const pretty = (t: string) =>
    t
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/^\w/, (c) => c.toUpperCase());

  /* ── A file is in the slot ── */
  if (status === "success" && currentFile) {
    const mismatch = classificationStatus === "done" && !!classification && classification.detected_type !== docType;
    const matched = classificationStatus === "done" && !!classification && classification.detected_type === docType;
    return (
      <div className={cx("flex min-h-[76px] items-center gap-3 rounded-card border bg-surface px-3.5 py-3", mismatch ? "border-part/50 bg-part-soft" : matched ? "border-ok/40" : "border-line-strong")}>
        <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", mismatch ? "bg-part text-white" : matched ? "bg-ok text-white" : "bg-sunken text-ink-3")}>
          {classificationStatus === "classifying" ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : mismatch ? (
            <TriangleAlert className="h-4 w-4" />
          ) : (
            <Check className="h-4 w-4" strokeWidth={3} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium">{label}</p>
          <p className={cx("truncate text-[12px]", mismatch ? "text-part" : "text-ink-3")} aria-live="polite">
            {classificationStatus === "classifying"
              ? "Checking"
              : mismatch && classification
                ? `Looks like: ${pretty(classification.detected_type)}`
                : currentFile.name}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRemove}
          aria-label={`Remove ${label}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-sunken hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  /* ── Empty slot, or one that just failed ── */
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files.length > 0) uploadFile(e.dataTransfer.files[0]);
      }}
      className={cx(
        "relative flex min-h-[76px] cursor-pointer items-center gap-3 rounded-card border-2 border-dashed px-3.5 py-3 transition-colors focus-within:border-ink",
        isDragging ? "border-ink bg-sunken" : status === "error" ? "border-bad/50 bg-bad-soft" : "border-line-strong bg-surface hover:border-ink-3",
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sunken text-ink-2">
        {status === "uploading" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium">
          {label}
          {required && (
            <span className="ml-1 text-bad" aria-hidden="true">
              *
            </span>
          )}
          {required && <span className="sr-only"> (required)</span>}
        </span>
        <span className={cx("block truncate text-[12px]", status === "error" ? "text-bad" : "text-ink-3")} aria-live="polite">
          {status === "uploading" ? "Uploading" : status === "error" && error ? error : required ? "Drop or choose a file" : "Optional"}
        </span>
      </span>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) uploadFile(e.target.files[0]);
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label={`Upload ${label}`}
      />
    </label>
  );
}
