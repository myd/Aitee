"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const MAX = 600;

export default function NewOrderPage() {
  const router = useRouter();
  const [request, setRequest] = useState("");
  const [colour, setColour] = useState("bone");
  const [size, setSize] = useState("M");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const tooLong = request.length > MAX;
  const canSubmit = request.trim().length >= 3 && !tooLong && !submitting;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request, garment: { colour, size } }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        setSubmitting(false);
        return;
      }
      router.push(`/orders/${data.id}`);
    } catch {
      setError("Couldn't reach the studio. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="wrap">
      <p className="eyebrow">Unseen Studio</p>
      <h1>Describe a shirt. We&apos;ll surprise you.</h1>
      <p className="lede">
        Tell us what you want on it — a subject, a feeling, an in-joke. An art director works up
        the design, two reviewers check it, and it goes to print. You see it when it lands on your
        doormat, not before.
      </p>

      <form className="panel" onSubmit={submit}>
        <label htmlFor="request">What should be on the shirt?</label>
        <textarea
          id="request"
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder="My corgi, who has never once come when called."
          autoFocus
        />
        <p className={`counter${tooLong ? " over" : ""}`}>
          {request.length} / {MAX} — a sentence or two is plenty. The more specific the feeling, the
          better the shirt.
        </p>

        <div className="row">
          <div>
            <label htmlFor="colour">Garment</label>
            <select id="colour" value={colour} onChange={(e) => setColour(e.target.value)}>
              <option value="bone">Bone</option>
              <option value="black">Black</option>
              <option value="forest">Forest</option>
              <option value="washed denim">Washed denim</option>
            </select>
          </div>
          <div>
            <label htmlFor="size">Size</label>
            <select id="size" value={size} onChange={(e) => setSize(e.target.value)}>
              {["XS", "S", "M", "L", "XL", "2XL"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <button type="submit" disabled={!canSubmit}>
          {submitting ? "Sending to the studio…" : "Send it to the studio"}
        </button>
        {error && <p className="error">{error}</p>}
      </form>

      <div className="note">
        <p>
          <strong>What we won&apos;t print.</strong> Hate symbols and slurs, sexual content, gore,
          anyone&apos;s likeness without their say-so, other people&apos;s logos and characters, and
          scannable codes. If your idea runs into one of those we&apos;ll tell you straight away and
          you won&apos;t be charged.
        </p>
        <p>
          <strong>Every design gets checked twice.</strong> Two reviewers look at the finished
          artwork independently, and anything either of them is unsure about — anything with words
          on it, always — goes to a person before it prints.
        </p>
      </div>
    </main>
  );
}
