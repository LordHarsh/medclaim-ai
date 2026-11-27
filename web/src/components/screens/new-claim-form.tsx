"use client";

/**
 * Filing a claim. One need: get it submitted without guessing what is required.
 * Category is a set of tiles, the documents it needs appear as slots, and the button wakes up when they are all in.
 */
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, FileText, LoaderCircle } from "lucide-react";
import { Button, Card, Label, LinkButton, Notice, Page, TopBar, cx } from "@/components/ui";
import { CategoryIcon } from "@/components/claim/category";
import { categoryLabel } from "@/components/claim/model";
import { submitClaim } from "@/lib/actions/claims";
import {
  CLAIM_CATEGORIES,
  DOCUMENT_REQUIREMENTS,
  DOCUMENT_TYPE_LABELS,
  validateRequiredDocuments,
  type ClaimCategory,
  type DocumentType,
} from "@/lib/validations";
import { SingleDocUpload } from "@/components/document-upload";
import { appNav } from "./nav";

interface UploadedDoc {
  name: string;
  size: number;
  s3Key: string;
  detectedType?: string | null;
}

type ClassState = "classifying" | "matched" | "mismatched" | "error";

export function NewClaimForm() {
  const router = useRouter();
  const [category, setCategory] = useState<ClaimCategory | "">("");
  const [treatmentDate, setTreatmentDate] = useState("");
  const [claimedAmount, setClaimedAmount] = useState("");
  const [hospitalName, setHospitalName] = useState("");
  // Map: docType -> uploaded file info
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, UploadedDoc>>({});
  // Map: docType -> classification status
  const [classificationState, setClassificationState] = useState<Record<string, ClassState>>({});
  const [errors, setErrors] = useState<{ field?: string; message: string }[]>([]);
  const [loading, setLoading] = useState(false);

  // Generate a temporary claim ID for file uploads
  const [tempClaimId] = useState(() => crypto.randomUUID());
  // Read the clock once, when the form opens.
  const [openedAt] = useState(() => Date.now());

  const handleUploadComplete = useCallback((docType: string, s3Key: string, detectedType?: string | null) => {
    setUploadedDocs((prev) => {
      const parts = s3Key.split("/");
      const fullName = parts[parts.length - 1];
      const name = fullName.startsWith(`${docType}_`) ? fullName.slice(docType.length + 1) : fullName;
      return { ...prev, [docType]: { name, size: 0, s3Key, detectedType } };
    });
  }, []);

  const handleRemoveDoc = useCallback((docType: string) => {
    setUploadedDocs((prev) => {
      const updated = { ...prev };
      delete updated[docType];
      return updated;
    });
    setClassificationState((prev) => {
      const updated = { ...prev };
      delete updated[docType];
      return updated;
    });
  }, []);

  const handleClassificationChange = useCallback((docType: string, status: ClassState) => {
    setClassificationState((prev) => ({ ...prev, [docType]: status }));
  }, []);

  const docRequirements = category ? DOCUMENT_REQUIREMENTS[category] : null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors([]);

    if (!category) {
      setErrors([{ field: "category", message: "Choose a category." }]);
      return;
    }

    // Validate required documents
    const missingDocs = validateRequiredDocuments(
      category as ClaimCategory,
      // Build a mapping of s3Key -> docType for validation
      Object.fromEntries(Object.entries(uploadedDocs).map(([docType, info]) => [info.s3Key, docType])),
    );
    if (missingDocs.length > 0) {
      setErrors(missingDocs.map((doc) => ({ field: "documents", message: `Missing: ${doc}` })));
      return;
    }

    setLoading(true);

    // Build document_keys array and document_types mapping
    const documentKeys = Object.values(uploadedDocs).map((d) => d.s3Key);
    const documentTypes: Record<string, string> = {};
    for (const [docType, info] of Object.entries(uploadedDocs)) {
      documentTypes[info.s3Key] = docType;
    }

    const formData = new FormData();
    formData.set("category", category);
    formData.set("treatment_date", treatmentDate);
    formData.set("claimed_amount", claimedAmount);
    formData.set("hospital_name", hospitalName);
    formData.set("document_keys", JSON.stringify(documentKeys));
    formData.set("document_types", JSON.stringify(documentTypes));

    try {
      const result = await submitClaim(formData);

      if (result.success) {
        router.push(`/claims/${result.data.claim_id}`);
      } else {
        setErrors(result.errors);
      }
    } catch {
      setErrors([{ message: "That did not go through. Try again." }]);
    } finally {
      setLoading(false);
    }
  }

  const today = new Date(openedAt).toISOString().split("T")[0];
  const required = docRequirements?.required ?? [];
  const ready = required.filter((dt) => !!uploadedDocs[dt]?.s3Key && classificationState[dt] === "matched").length;

  // Must have file + classification must be "matched" (not classifying, mismatched, or error)
  const allRequiredUploaded = !!category && required.length > 0 && ready === required.length;

  // The policy turns down bills filed more than 30 days after treatment. Say so only when it applies.
  const daysOld = treatmentDate ? Math.floor((openedAt - new Date(treatmentDate).getTime()) / 86400000) : 0;

  return (
    <div className="min-h-screen">
      <TopBar home="/dashboard" nav={appNav("claims")} />
      <Page narrow>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">New claim</h1>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate={false}>
          {errors.length > 0 && (
            <Notice tone="bad" icon={<CircleAlert className="h-4 w-4" />} title="Fix this first">
              <ul className="list-inside list-disc">
                {errors.map((err, i) => (
                  <li key={i}>{err.message}</li>
                ))}
              </ul>
            </Notice>
          )}

          <Card className="p-5">
            <fieldset>
              <legend>
                <Label>1 · Category</Label>
              </legend>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CLAIM_CATEGORIES.map((cat) => {
                  const on = category === cat;
                  return (
                    <label
                      key={cat}
                      className={cx(
                        "flex cursor-pointer items-center gap-2.5 rounded-card border px-3 py-3 text-[14px] font-medium transition-colors focus-within:ring-2 focus-within:ring-ink",
                        on ? "border-ink bg-ink text-white" : "border-line-strong bg-surface hover:border-ink-3",
                      )}
                    >
                      <input
                        type="radio"
                        name="category"
                        value={cat}
                        checked={on}
                        onChange={() => {
                          setCategory(cat);
                          setUploadedDocs({});
                          setClassificationState({});
                        }}
                        className="sr-only"
                        required
                      />
                      <CategoryIcon category={cat} className="h-5 w-5 shrink-0" />
                      <span className="truncate">{categoryLabel(cat)}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </Card>

          <Card className="p-5">
            <Label>2 · Bill</Label>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="claimed_amount" className="block text-[13px] font-medium">
                  Amount
                </label>
                <div className="relative mt-1.5">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">₹</span>
                  <input
                    id="claimed_amount"
                    type="number"
                    inputMode="decimal"
                    min="500"
                    step="0.01"
                    placeholder="1,500"
                    value={claimedAmount}
                    onChange={(e) => setClaimedAmount(e.target.value)}
                    required
                    className="field pl-7 tabular-nums"
                    aria-describedby="amount-hint"
                  />
                </div>
                <p id="amount-hint" className="mt-1 text-[12px] text-ink-3">
                  ₹500 or more
                </p>
              </div>
              <div>
                <label htmlFor="treatment_date" className="block text-[13px] font-medium">
                  Treatment date
                </label>
                <input
                  id="treatment_date"
                  type="date"
                  value={treatmentDate}
                  onChange={(e) => setTreatmentDate(e.target.value)}
                  max={today}
                  required
                  className="field mt-1.5"
                  aria-describedby="date-hint"
                />
                <p id="date-hint" className={cx("mt-1 text-[12px]", daysOld > 30 ? "font-medium text-part" : "text-ink-3")}>
                  {daysOld > 30 ? `${daysOld} days ago. Over 30 is rejected.` : "Within the last 30 days"}
                </p>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="hospital_name" className="block text-[13px] font-medium">
                  Hospital or clinic <span className="font-normal text-ink-3">(optional)</span>
                </label>
                <input
                  id="hospital_name"
                  type="text"
                  value={hospitalName}
                  onChange={(e) => setHospitalName(e.target.value)}
                  maxLength={256}
                  className="field mt-1.5"
                />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <Label>3 · Documents</Label>
              {category && required.length > 0 && (
                <span className={cx("rounded-full px-2 py-0.5 text-[12px] font-medium tabular-nums", allRequiredUploaded ? "bg-ok-soft text-ok" : "bg-sunken text-ink-2")}>
                  {ready} of {required.length}
                </span>
              )}
            </div>

            {!category || !docRequirements ? (
              <div className="mt-3 flex min-h-[76px] items-center justify-center gap-2 rounded-card border-2 border-dashed border-line text-[13px] text-ink-3">
                <FileText className="h-4 w-4" /> Pick a category first
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[...docRequirements.required, ...docRequirements.optional].map((docType) => (
                  <SingleDocUpload
                    key={docType}
                    claimId={tempClaimId}
                    docType={docType}
                    label={DOCUMENT_TYPE_LABELS[docType as DocumentType]}
                    required={docRequirements.required.includes(docType)}
                    onUploadComplete={handleUploadComplete}
                    onRemove={handleRemoveDoc}
                    onClassificationChange={handleClassificationChange}
                    currentFile={uploadedDocs[docType] || null}
                  />
                ))}
              </div>
            )}
          </Card>

          <div className="flex items-center justify-end gap-2 pt-1">
            <LinkButton href="/dashboard" look="ghost">
              Cancel
            </LinkButton>
            <Button type="submit" disabled={loading || !allRequiredUploaded}>
              {loading && <LoaderCircle className="h-4 w-4 animate-spin" />}
              {loading ? "Submitting" : "Submit claim"}
            </Button>
          </div>
        </form>
      </Page>
    </div>
  );
}
