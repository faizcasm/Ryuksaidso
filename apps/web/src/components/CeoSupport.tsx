"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { BadgeCheck, CircleCheck, Headset, Mail, Send, X } from "lucide-react";
import { api } from "../lib/api";

const MIN_MESSAGE = 10;
const MAX_MESSAGE = 4000;

export interface SupportMessageItem {
  id: string;
  organizationId: string;
  userId: string;
  userName: string;
  userEmail: string;
  message: string;
  status: string;
  readAt: string | null;
  createdAt: string;
}

export interface SupportInbox {
  messages: SupportMessageItem[];
  unread: number;
}

function readError(e: unknown, fallback: string) {
  if (e instanceof Error) {
    try {
      const parsed = JSON.parse(e.message) as { message?: string };
      return parsed.message || fallback;
    } catch {
      return e.message || fallback;
    }
  }
  return fallback;
}

export function CeoSupportModal({
  email,
  onClose,
}: {
  email: string;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  const trimmed = text.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_MESSAGE;
  const valid = trimmed.length >= MIN_MESSAGE && trimmed.length <= MAX_MESSAGE;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !sending) onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    areaRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, sending]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!valid || sending) return;
    setSending(true);
    setError("");
    try {
      await api("/support", {
        method: "POST",
        body: JSON.stringify({ message: trimmed }),
      });
      setText("");
      setSent(true);
    } catch (e) {
      setError(readError(e, "Could not send your message. Try again in a moment."));
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="cs-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !sending) onClose();
      }}
    >
      <div
        className="cs-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Customer support — message the CEO"
      >
        <div className="cs-head">
          <div className="cs-avatar">FH</div>
          <div className="cs-head-copy">
            <div className="cs-name">
              <b>Faizan Hameed</b>
              <BadgeCheck size={14} aria-hidden />
            </div>
            <span>CEO &amp; Founder · RYUKSAIDSO</span>
            <i className="cs-online">
              <em /> Direct line — every message is read personally
            </i>
          </div>
          <button
            className="ghost-icon cs-close"
            onClick={onClose}
            disabled={sending}
            title="Close"
            aria-label="Close customer support"
          >
            <X size={15} />
          </button>
        </div>

        {sent ? (
          <div className="cs-sent">
            <div className="cs-check">
              <CircleCheck size={30} />
            </div>
            <b>Message delivered</b>
            <p>
              Faizan has your note. If there is anything to follow up on, you
              will hear back at <strong>{email}</strong> — from him, not a bot.
            </p>
            <div className="cs-sent-actions">
              <button
                className="secondary"
                onClick={() => {
                  setSent(false);
                  setError("");
                }}
              >
                Send another message
              </button>
              <button className="primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form className="cs-body" onSubmit={send}>
            <p className="cs-note">
              No ticket queue, no chatbot roulette. Tell me what is broken,
              what you need, or what we should build next — it lands straight
              in my inbox.
            </p>
            <textarea
              ref={areaRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (error) setError("");
              }}
              maxLength={MAX_MESSAGE}
              placeholder="Send your message to CEO…"
              rows={6}
              aria-label="Send your message to CEO"
            />
            <div className="cs-meta">
              {error ? (
                <span className="cs-error">{error}</span>
              ) : tooShort ? (
                <span className="cs-hint">
                  {MIN_MESSAGE - trimmed.length} more characters to send
                </span>
              ) : (
                <span className="cs-hint">
                  He reads every message himself.
                </span>
              )}
              <span className="cs-count">
                {trimmed.length.toLocaleString()} / {MAX_MESSAGE.toLocaleString()}
              </span>
            </div>
            <div className="cs-foot">
              <span className="cs-reply">
                <Mail size={13} aria-hidden />
                <span>Replies to {email}</span>
              </span>
              <button
                className="primary"
                type="submit"
                disabled={!valid || sending}
              >
                {sending ? "Sending…" : "Send message"}
                <Send size={14} aria-hidden />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export function SupportInboxList({
  inbox,
  onRead,
}: {
  inbox: SupportInbox | null;
  onRead: (id: string) => void;
}) {
  if (!inbox?.messages.length) {
    return (
      <div className="empty">
        <div className="empty-icon">
          <Headset size={18} aria-hidden />
        </div>
        <b>No messages yet</b>
        <p>
          When someone taps the support icon in the top bar and writes to the
          CEO, the message lands here.
        </p>
      </div>
    );
  }
  return (
    <div className="cs-inbox">
      {inbox.messages.map((m) => (
        <div
          key={m.id}
          className={`cs-inbox-row${m.status === "OPEN" ? " unread" : ""}`}
        >
          <div className="avatar small">{m.userName.slice(0, 1).toUpperCase()}</div>
          <div className="cs-inbox-copy">
            <div>
              <b>{m.userName}</b>
              <span>{m.userEmail}</span>
              <small>{m.organizationId.slice(-8)}</small>
            </div>
            <p>{m.message}</p>
          </div>
          <div className="cs-inbox-side">
            <small>{new Date(m.createdAt).toLocaleString()}</small>
            {m.status === "OPEN" ? (
              <button className="ghost" onClick={() => onRead(m.id)}>
                Mark read
              </button>
            ) : (
              <span className="status-badge completed">Read</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
