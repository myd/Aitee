"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import Link from "next/link";

interface OrderView {
  id: string;
  createdAt: string;
  request: string;
  garment: Record<string, string>;
  state: "queued" | "working" | "approved_for_print" | "needs_human" | "declined" | "failed";
  customerMessage?: string;
}

/**
 * The status page. Note what it never shows: the design.
 *
 * That is the product — the shirt is a surprise until it arrives — so the job
 * here is to make the wait feel deliberate rather than broken, and to be honest
 * about the one outcome the customer does need to hear about, which is a
 * decline.
 */
export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<OrderView | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;

    async function poll() {
      const res = await fetch(`/api/orders/${id}`);
      if (!live) return;
      if (res.status === 404) {
        setMissing(true);
        return;
      }
      const data: OrderView = await res.json();
      setOrder(data);
      if (data.state === "queued" || data.state === "working") {
        setTimeout(poll, 2000);
      }
    }

    poll();
    return () => {
      live = false;
    };
  }, [id]);

  if (missing) {
    return (
      <main className="wrap">
        <h1>We can&apos;t find that order.</h1>
        <p className="lede">
          The link may be stale. <Link href="/">Start a new one</Link>.
        </p>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="wrap">
        <p className="status working"><span className="dot" /> Loading</p>
      </main>
    );
  }

  const view = PRESENTATION[order.state];

  return (
    <main className="wrap">
      <p className="eyebrow">Order {order.id.slice(0, 8)}</p>
      <p className={`status ${view.tone}`}>
        <span className="dot" /> {view.label}
      </p>
      <h1>{view.heading}</h1>
      <p className="lede">{order.customerMessage ?? view.body}</p>

      <div className="panel">
        <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>You asked for</p>
        <p className="quote">{order.request}</p>
        <p className="counter">
          {Object.entries(order.garment).map(([k, v]) => `${k}: ${v}`).join(" · ")}
        </p>
      </div>

      <div className="note">
        <p>
          <strong>No, you can&apos;t peek.</strong> We don&apos;t show the design before it ships —
          that&apos;s the whole point of the place. What we do promise is that two reviewers checked
          the finished artwork against our print policy, and that anything either of them hesitated
          over went to a person before it reached a printer.
        </p>
        <p>
          <Link href="/">Design another one</Link>
        </p>
      </div>
    </main>
  );
}

const PRESENTATION: Record<
  OrderView["state"],
  { label: string; tone: string; heading: string; body: string }
> = {
  queued: {
    label: "Queued",
    tone: "working",
    heading: "In the queue.",
    body: "Your brief is with the studio. This page updates itself.",
  },
  working: {
    label: "In the studio",
    tone: "working",
    heading: "Someone's working on it.",
    body: "An art director is drawing up the concept, and two reviewers will check the artwork before it prints. A couple of minutes.",
  },
  approved_for_print: {
    label: "Going to print",
    tone: "ok",
    heading: "It cleared. It's going to print.",
    body: "The design passed both reviews with nothing flagged. You'll get a dispatch note when it's in the post — and the shirt itself will be the first time you see it.",
  },
  needs_human: {
    label: "With a reviewer",
    tone: "hold",
    heading: "One of our people is taking a look.",
    body: "Nothing is wrong. Your design landed in the small share we always put in front of a human — anything with words on it goes this way as a matter of course. Expect an update within a day.",
  },
  declined: {
    label: "Declined",
    tone: "stop",
    heading: "We can't make this one.",
    body: "This idea runs into something we don't print. You haven't been charged. Send us another and we'll get straight on it.",
  },
  failed: {
    label: "Failed",
    tone: "stop",
    heading: "Something broke on our side.",
    body: "Nothing has been printed and you haven't been charged. Try again, and if it keeps happening let us know.",
  },
};
