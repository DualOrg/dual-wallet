import { AlertCircle, CheckCircle2 } from "lucide-react";

export function Alert({
  children,
  tone = "error",
}: {
  children: React.ReactNode;
  tone?: "error" | "success";
}) {
  const Icon = tone === "success" ? CheckCircle2 : AlertCircle;
  return (
    <div
      className={`alert alert-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon size={17} aria-hidden />
      {children}
    </div>
  );
}
