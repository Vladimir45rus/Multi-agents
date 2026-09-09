import { PRIVACY_MD } from "@/lib/legal-docs";

export const dynamic = "force-static";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl p-6 text-sm leading-relaxed">
      <pre className="whitespace-pre-wrap font-sans">{PRIVACY_MD}</pre>
    </div>
  );
}
