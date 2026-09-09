import { readFileSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-static";

function loadDoc(file: string): string {
  try {
    return readFileSync(path.join(process.cwd(), file), "utf8");
  } catch {
    return "Документ недоступен.";
  }
}

export default function DonateTermsPage() {
  const md = loadDoc("DONATE.md");
  return (
    <div className="mx-auto max-w-3xl p-6 text-sm leading-relaxed">
      <pre className="whitespace-pre-wrap font-sans">{md}</pre>
    </div>
  );
}
