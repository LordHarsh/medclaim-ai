import { FlaskConical, Glasses, Leaf, Pill, Smile, Stethoscope, FileText } from "lucide-react";

const ICON: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  CONSULTATION: Stethoscope,
  DIAGNOSTIC: FlaskConical,
  PHARMACY: Pill,
  DENTAL: Smile,
  VISION: Glasses,
  ALTERNATIVE_MEDICINE: Leaf,
};

export function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const Icon = ICON[category] ?? FileText;
  return <Icon className={className ?? "h-4 w-4"} strokeWidth={1.9} aria-hidden="true" />;
}
