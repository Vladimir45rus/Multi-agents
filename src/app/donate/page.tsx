import { DONATE_MD } from "@/lib/legal-docs";

export const dynamic = "force-static";

export default function DonateTermsPage() {
  return (
    <div className="mx-auto max-w-3xl p-6 text-sm leading-relaxed">
      <pre className="whitespace-pre-wrap font-sans">{DONATE_MD}</pre>
    </div>
  );
}
