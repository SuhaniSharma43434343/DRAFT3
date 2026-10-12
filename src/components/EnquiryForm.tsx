"use client";

import { useState } from "react";

// The enquiry form. There is no backend: it composes the enquiry and hands it to the visitor's own
// mail application, addressed to `email` from src/content/site.ts. Until the owner supplies that
// address the form still works as a composer and copies the enquiry to the clipboard, and says so.

type Status = "idle" | "sent" | "copied" | "failed";

const MESSAGES: Record<Exclude<Status, "idle">, string> = {
  sent: "Your mail application has opened with the enquiry ready to send.",
  copied:
    "Direct contact details are still to be confirmed. Your enquiry has been copied to the clipboard, ready to send once they are published.",
  failed: "Direct contact details are still to be confirmed, so this enquiry could not be sent yet.",
};

export function EnquiryForm({
  email,
  commodities,
  regions,
}: {
  email: string;
  commodities: string[];
  regions: string[];
}) {
  const [status, setStatus] = useState<Status>("idle");

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const get = (k: string) => String(data.get(k) ?? "").trim();
    const subject = `Enquiry: ${get("commodity") || "General"} (${get("company") || get("name")})`;
    const lines: string[] = [];
    const add = (label: string, key: string) => {
      const value = get(key);
      if (value) lines.push(`${label}: ${value}`);
    };
    add("Name", "name");
    add("Company", "company");
    add("Email", "email");
    add("Phone", "phone");
    add("Commodity", "commodity");
    add("Market", "region");
    const body = [...lines, "", get("message")].join("\n");
    if (email) {
      window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      setStatus("sent");
      return;
    }
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${body}`);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  };

  return (
    <form onSubmit={onSubmit} className="enquiry-form">
      <div className="grid gap-x-8 gap-y-7 md:grid-cols-2">
        <label className="field">
          <span className="label">Name</span>
          <input name="name" type="text" autoComplete="name" required />
        </label>
        <label className="field">
          <span className="label">Company</span>
          <input name="company" type="text" autoComplete="organization" />
        </label>
        <label className="field">
          <span className="label">Email</span>
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label className="field">
          <span className="label">Phone (optional)</span>
          <input name="phone" type="tel" autoComplete="tel" />
        </label>
        <label className="field">
          <span className="label">Commodity of interest</span>
          <select name="commodity" defaultValue="">
            <option value="">Select a segment</option>
            {commodities.map((c) => (
              <option key={c}>{c}</option>
            ))}
            <option>Other</option>
          </select>
        </label>
        <label className="field">
          <span className="label">Market (optional)</span>
          <select name="region" defaultValue="">
            <option value="">Select a region</option>
            {regions.map((r) => (
              <option key={r}>{r}</option>
            ))}
            <option>Other</option>
          </select>
        </label>
        <label className="field md:col-span-2">
          <span className="label">Your enquiry</span>
          <textarea name="message" rows={4} required />
        </label>
      </div>
      <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
        <button type="submit" className="btn btn-solid">
          {email ? "Send enquiry" : "Prepare enquiry"}
        </button>
        <p role="status" aria-live="polite" className="max-w-[46ch] text-[0.9375rem] leading-snug text-muted">
          {status === "idle"
            ? email
              ? "Opens in your mail application."
              : "Direct contact details: to be confirmed."
            : MESSAGES[status]}
        </p>
      </div>
    </form>
  );
}
