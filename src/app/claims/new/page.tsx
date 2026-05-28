"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { submitClaim } from "@/lib/actions/claims";
import { CLAIM_CATEGORIES } from "@/lib/validations";
import { DocumentUpload } from "@/components/document-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewClaimPage() {
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [treatmentDate, setTreatmentDate] = useState("");
  const [claimedAmount, setClaimedAmount] = useState("");
  const [hospitalName, setHospitalName] = useState("");
  const [documentKeys, setDocumentKeys] = useState<string[]>([]);
  const [errors, setErrors] = useState<{ field?: string; message: string }[]>([]);
  const [loading, setLoading] = useState(false);

  // Generate a temporary claim ID for file uploads
  const [tempClaimId] = useState(() => crypto.randomUUID());

  const handleDocumentsChange = useCallback((keys: string[]) => {
    setDocumentKeys(keys);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors([]);
    setLoading(true);

    const formData = new FormData();
    formData.set("category", category);
    formData.set("treatment_date", treatmentDate);
    formData.set("claimed_amount", claimedAmount);
    formData.set("hospital_name", hospitalName);
    formData.set("document_keys", JSON.stringify(documentKeys));

    try {
      const result = await submitClaim(formData);

      if (result.success) {
        router.push(`/claims/${result.data.claim_id}`);
      } else {
        setErrors(result.errors);
      }
    } catch {
      setErrors([{ message: "An unexpected error occurred. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5 text-white"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </div>
              <span className="text-xl font-bold text-gray-900">MedClaim AI</span>
            </Link>
          </div>
          <Link href="/dashboard">
            <Button variant="outline">Back to Dashboard</Button>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Submit New Claim</h1>
          <p className="mt-1 text-sm text-gray-600">
            Fill in the details below and upload your medical documents.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Errors */}
          {errors.length > 0 && (
            <div className="rounded-md bg-red-50 px-4 py-3">
              <ul className="list-inside list-disc text-sm text-red-700">
                {errors.map((err, i) => (
                  <li key={i}>{err.message}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Claim Details */}
          <Card>
            <CardHeader>
              <CardTitle>Claim Details</CardTitle>
              <CardDescription>
                Provide information about your treatment and expenses
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="category">Claim Category</Label>
                <Select value={category} onValueChange={(val) => setCategory(val ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CLAIM_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="treatment_date">Treatment Date</Label>
                  <Input
                    id="treatment_date"
                    type="date"
                    value={treatmentDate}
                    onChange={(e) => setTreatmentDate(e.target.value)}
                    max={today}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="claimed_amount">Claimed Amount (INR)</Label>
                  <Input
                    id="claimed_amount"
                    type="number"
                    min="500"
                    step="0.01"
                    placeholder="e.g., 1500"
                    value={claimedAmount}
                    onChange={(e) => setClaimedAmount(e.target.value)}
                    required
                  />
                  <p className="text-xs text-gray-500">Minimum Rs. 500</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="hospital_name">
                  Hospital/Clinic Name{" "}
                  <span className="text-gray-400">(optional)</span>
                </Label>
                <Input
                  id="hospital_name"
                  type="text"
                  placeholder="e.g., Apollo Hospital, Mumbai"
                  value={hospitalName}
                  onChange={(e) => setHospitalName(e.target.value)}
                  maxLength={256}
                />
              </div>
            </CardContent>
          </Card>

          {/* Document Upload */}
          <Card>
            <CardHeader>
              <CardTitle>Supporting Documents</CardTitle>
              <CardDescription>
                Upload prescriptions, bills, lab reports, or pharmacy receipts.
                All documents must clearly show patient name and date.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DocumentUpload
                claimId={tempClaimId}
                onFilesChange={handleDocumentsChange}
              />
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex items-center justify-end gap-4">
            <Link href="/dashboard">
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
            <Button
              type="submit"
              disabled={loading || documentKeys.length === 0}
              className="px-8"
            >
              {loading ? "Submitting..." : "Submit Claim"}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
