"use client";

import { useState, useCallback } from "react";

interface UploadedFile {
  file: File;
  s3Key: string;
  status: "uploading" | "success" | "error";
  error?: string;
}

interface DocumentUploadProps {
  claimId: string;
  onFilesChange: (s3Keys: string[]) => void;
}

export function DocumentUpload({ claimId, onFilesChange }: DocumentUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const uploadFile = useCallback(
    async (file: File) => {
      const newFile: UploadedFile = {
        file,
        s3Key: "",
        status: "uploading",
      };

      setFiles((prev) => [...prev, newFile]);

      try {
        // Get presigned URL
        const params = new URLSearchParams({
          claim_id: claimId,
          filename: file.name,
          content_type: file.type,
          size_bytes: file.size.toString(),
        });

        const response = await fetch(`/api/upload-url?${params}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to get upload URL");
        }

        // Upload to S3
        const uploadResponse = await fetch(data.presigned_url, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type,
          },
        });

        if (!uploadResponse.ok) {
          throw new Error("Upload failed");
        }

        // Update state
        setFiles((prev) => {
          const updated = prev.map((f) =>
            f.file === file
              ? { ...f, s3Key: data.s3_key, status: "success" as const }
              : f
          );
          onFilesChange(
            updated.filter((f) => f.status === "success").map((f) => f.s3Key)
          );
          return updated;
        });
      } catch (error) {
        setFiles((prev) =>
          prev.map((f) =>
            f.file === file
              ? {
                  ...f,
                  status: "error" as const,
                  error: error instanceof Error ? error.message : "Upload failed",
                }
              : f
          )
        );
      }
    },
    [claimId, onFilesChange]
  );

  const handleFiles = useCallback(
    (fileList: FileList) => {
      const validTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/pdf",
      ];
      const maxSize = 10 * 1024 * 1024;

      Array.from(fileList).forEach((file) => {
        if (!validTypes.includes(file.type)) {
          setFiles((prev) => [
            ...prev,
            {
              file,
              s3Key: "",
              status: "error" as const,
              error: "Invalid file type. Only JPEG, PNG, WebP, and PDF allowed.",
            },
          ]);
          return;
        }
        if (file.size > maxSize) {
          setFiles((prev) => [
            ...prev,
            {
              file,
              s3Key: "",
              status: "error" as const,
              error: "File too large. Maximum size is 10MB.",
            },
          ]);
          return;
        }
        uploadFile(file);
      });
    },
    [uploadFile]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      onFilesChange(
        updated.filter((f) => f.status === "success").map((f) => f.s3Key)
      );
      return updated;
    });
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 transition-all duration-200 ${
          isDragging
            ? "border-[var(--primary-indigo)] bg-[var(--primary-bg-subdued)]/20"
            : "border-[var(--hairline)] hover:border-[var(--hairline-input)]"
        }`}
      >
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
            isDragging ? "bg-[var(--primary-bg-subdued)]" : "bg-[var(--canvas-soft)]"
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-6 w-6 transition-colors ${
              isDragging ? "text-[var(--primary-indigo)]" : "text-[var(--ink-mute)]"
            }`}
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <p className="mt-3 body-md text-[var(--ink)]">
          <span className="text-[var(--primary-indigo)] font-normal">Click to upload</span>{" "}
          or drag and drop
        </p>
        <p className="mt-1 micro text-[var(--ink-mute)]">
          JPEG, PNG, WebP, or PDF (max 10MB per file)
        </p>
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((uploadedFile, index) => (
            <li
              key={index}
              className="flex items-center justify-between rounded-lg border border-[var(--hairline)] bg-[var(--canvas)] px-4 py-3 transition-all duration-200"
            >
              <div className="flex items-center gap-3">
                {uploadedFile.status === "uploading" && (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--primary-indigo)] border-t-transparent" />
                )}
                {uploadedFile.status === "success" && (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3 w-3 text-emerald-600"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                )}
                {uploadedFile.status === "error" && (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3 w-3 text-red-600"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </div>
                )}
                <div>
                  <p className="body-md text-[var(--ink)]">
                    {uploadedFile.file.name}
                  </p>
                  {uploadedFile.error && (
                    <p className="micro text-red-600">{uploadedFile.error}</p>
                  )}
                  {uploadedFile.status === "uploading" && (
                    <p className="micro text-[var(--primary-indigo)]">Uploading...</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--ink-mute)] hover:text-[var(--ink)] hover:bg-[var(--canvas-soft)] transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ========================================================================
   Single Document Slot Upload
   Used by the category-aware form to provide one upload input per document type.
   ======================================================================== */

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
  currentFile?: { name: string; size: number; s3Key: string } | null;
}

export function SingleDocUpload({
  claimId,
  docType,
  label,
  required,
  onUploadComplete,
  onRemove,
  currentFile,
}: SingleDocUploadProps) {
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">(
    currentFile ? "success" : "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [classificationStatus, setClassificationStatus] = useState<ClassificationStatus>("idle");
  const [classification, setClassification] = useState<ClassificationResult | null>(null);

  const classifyDocument = useCallback(async (s3Key: string, contentType: string) => {
    setClassificationStatus("classifying");
    setClassification(null);
    try {
      const res = await fetch("/api/classify-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ s3_key: s3Key, content_type: contentType }),
      });
      if (!res.ok) {
        setClassificationStatus("error");
        return;
      }
      const data = (await res.json()) as ClassificationResult;
      setClassification(data);
      setClassificationStatus("done");
    } catch {
      setClassificationStatus("error");
    }
  }, []);

  const uploadFile = useCallback(
    async (file: File) => {
      const validTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/pdf",
      ];
      const maxSize = 10 * 1024 * 1024;

      if (!validTypes.includes(file.type)) {
        setStatus("error");
        setError("Invalid file type. Only JPEG, PNG, WebP, and PDF allowed.");
        return;
      }
      if (file.size > maxSize) {
        setStatus("error");
        setError("File too large. Maximum size is 10MB.");
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
        // Classify after upload — fire and forget (non-blocking)
        classifyDocument(data.s3_key, file.type);
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Upload failed");
      }
    },
    [claimId, docType, onUploadComplete, classifyDocument]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      uploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleRemove = () => {
    setStatus("idle");
    setError(null);
    setClassificationStatus("idle");
    setClassification(null);
    onRemove(docType);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Classification badge helper
  const renderClassificationBadge = () => {
    if (classificationStatus === "idle") return null;

    if (classificationStatus === "classifying") {
      return (
        <div className="mt-1.5 flex items-center gap-1.5">
          <div className="h-3 w-3 animate-spin rounded-full border border-[var(--ink-mute)] border-t-transparent" />
          <span className="micro text-[var(--ink-mute)]">Classifying...</span>
        </div>
      );
    }

    if (classificationStatus === "error" || !classification) return null;

    const detectedLabel = classification.detected_type
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());

    const isMatch = classification.detected_type === docType;

    if (isMatch) {
      return (
        <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 border border-emerald-200">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-2.5 w-2.5 text-emerald-600 shrink-0"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="micro text-emerald-700">{detectedLabel} detected</span>
        </div>
      );
    }

    return (
      <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 border border-amber-200">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-2.5 w-2.5 text-amber-600 shrink-0"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span className="micro text-amber-700">{detectedLabel} detected</span>
      </div>
    );
  };

  // If a file is uploaded/uploading, show the file info
  if (status === "success" && currentFile) {
    return (
      <div
        className={`rounded-lg border px-4 py-3 transition-all duration-200 ${
          required
            ? "border-l-[3px] border-l-[var(--primary-indigo)] border-t-[var(--hairline)] border-r-[var(--hairline)] border-b-[var(--hairline)]"
            : "border-[var(--hairline)]"
        } bg-[var(--canvas)]`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 shrink-0">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3 w-3 text-emerald-600"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <p className="body-md text-[var(--ink)]">{currentFile.name}</p>
              <p className="micro text-[var(--ink-mute)]">
                {label} &middot; {formatSize(currentFile.size)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--ink-mute)] hover:text-[var(--ink)] hover:bg-[var(--canvas-soft)] transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {renderClassificationBadge()}
      </div>
    );
  }

  // Upload slot (empty or error state)
  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative flex items-center gap-3 rounded-lg border-2 border-dashed px-4 py-4 transition-all duration-200 ${
        isDragging
          ? "border-[var(--primary-indigo)] bg-[var(--primary-bg-subdued)]/20"
          : required
            ? "border-l-[3px] border-l-[var(--primary-indigo)] border-t-[var(--hairline)] border-r-[var(--hairline)] border-b-[var(--hairline)]"
            : "border-[var(--hairline)] hover:border-[var(--hairline-input)]"
      }`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--canvas-soft)]">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4.5 w-4.5 text-[var(--ink-mute)]"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="body-md text-[var(--ink)]">
          {label}
          {required && <span className="text-[var(--ruby)] ml-0.5">*</span>}
          {!required && (
            <span className="text-[var(--ink-mute)] ml-1.5">(optional)</span>
          )}
        </p>
        {status === "uploading" && (
          <p className="micro text-[var(--primary-indigo)]">Uploading...</p>
        )}
        {status === "error" && error && (
          <p className="micro text-red-600">{error}</p>
        )}
        {status === "idle" && (
          <p className="micro text-[var(--ink-mute)]">
            Click or drag a file here
          </p>
        )}
      </div>
      {status === "uploading" && (
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--primary-indigo)] border-t-transparent" />
      )}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            uploadFile(e.target.files[0]);
          }
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </div>
  );
}
