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
