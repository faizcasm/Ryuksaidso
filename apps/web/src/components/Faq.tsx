"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Search, X } from "lucide-react";
import { FAQ_CATEGORIES, FAQ_ITEMS, type FaqItem } from "../lib/faq";

function isExternal(href: string) {
  return href.startsWith("http");
}

function Answer({ item }: { item: FaqItem }) {
  return (
    <div className="faq-a">
      {item.a.split("\n\n").map((para, i) => (
        <p key={i}>{para}</p>
      ))}
      {item.link
        ? isExternal(item.link.href) ? (
            <a className="faq-a-link" href={item.link.href} target="_blank" rel="noreferrer">
              {item.link.label} <ArrowRight size={13} />
            </a>
          ) : (
            <Link className="faq-a-link" href={item.link.href}>
              {item.link.label} <ArrowRight size={13} />
            </Link>
          )
        : null}
    </div>
  );
}

export default function FaqExplorer() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string>("All");
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [allOpen, setAllOpen] = useState(false);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of FAQ_ITEMS) map.set(item.cat, (map.get(item.cat) ?? 0) + 1);
    return map;
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FAQ_ITEMS.map((item, index) => ({ item, index })).filter(({ item }) => {
      if (cat !== "All" && item.cat !== cat) return false;
      if (!q) return true;
      return `${item.q} ${item.a}`.toLowerCase().includes(q);
    });
  }, [query, cat]);

  function toggle(index: number) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleAll() {
    if (allOpen) {
      setOpen(new Set());
      setAllOpen(false);
    } else {
      setOpen(new Set(results.map(({ index }) => index)));
      setAllOpen(true);
    }
  }

  const allVisibleOpen = results.length > 0 && results.every(({ index }) => open.has(index));

  return (
    <div className="faq-explorer">
      <div className="faq-controls">
        <div className="faq-search">
          <Search size={15} />
          <input
            type="text"
            value={query}
            placeholder="Search questions… (approvals, pricing, GitHub, Ollama)"
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search questions"
          />
          {query ? (
            <button type="button" className="faq-clear" onClick={() => setQuery("")} aria-label="Clear search">
              <X size={14} />
            </button>
          ) : null}
        </div>
        <button type="button" className="faq-expand" onClick={toggleAll} disabled={results.length === 0}>
          {allVisibleOpen ? "Collapse all" : "Expand all"}
        </button>
      </div>

      <div className="faq-chips" role="tablist" aria-label="Question categories">
        {[{ label: "All", count: FAQ_ITEMS.length }, ...FAQ_CATEGORIES.map((c) => ({ label: c as string, count: counts.get(c) ?? 0 }))].map(
          (chip) => (
            <button
              key={chip.label}
              type="button"
              role="tab"
              aria-selected={cat === chip.label}
              className={cat === chip.label ? "faq-chip active" : "faq-chip"}
              onClick={() => setCat(chip.label)}
            >
              {chip.label} <span>{chip.count}</span>
            </button>
          ),
        )}
      </div>

      <p className="faq-count">
        Showing {results.length} of {FAQ_ITEMS.length} questions
        {cat !== "All" ? ` in ${cat}` : ""}
        {query.trim() ? ` matching “${query.trim()}”` : ""}
      </p>

      <div className="faq-list">
        {results.map(({ item, index }) => {
          const isOpen = open.has(index);
          return (
            <div key={index} className={isOpen ? "faq-item open" : "faq-item"}>
              <button
                type="button"
                className="faq-q"
                aria-expanded={isOpen}
                onClick={() => toggle(index)}
              >
                <span>{item.q}</span>
                <ChevronDown size={16} className="faq-chevron" />
              </button>
              {isOpen ? <Answer item={item} /> : null}
            </div>
          );
        })}
        {results.length === 0 ? (
          <div className="faq-empty">
            <Search size={22} />
            <p>
              No questions match <b>“{query.trim() || cat}”</b>.
            </p>
            <button
              type="button"
              className="faq-reset"
              onClick={() => {
                setQuery("");
                setCat("All");
              }}
            >
              Show all questions
            </button>
          </div>
        ) : null}
      </div>

      <div className="faq-cta">
        <div>
          <h2>Still have questions?</h2>
          <p>
            Click the support icon in the app&apos;s top bar to message the CEO
            directly, or write to{" "}
            <a href="mailto:faizanhameed690@gmail.com">faizanhameed690@gmail.com</a>.
          </p>
        </div>
        <Link href="/auth" className="faq-cta-btn">
          Get started free <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
