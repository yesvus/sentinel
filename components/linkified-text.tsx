import { Fragment } from "react";
import { cn } from "@/lib/utils";

const URL_PATTERN = /https?:\/\/[^\s<>]+/gi;
const TRAILING_PUNCTUATION = /[),.;:!?}\]]+$/;

export function LinkifiedText({
  text,
  className,
  as = "span",
}: {
  text: string;
  className?: string;
  as?: "span" | "p" | "div";
}) {
  const parts: Array<{ text: string; href?: string }> = [];
  let cursor = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ text: text.slice(cursor, index) });
    const raw = match[0];
    const trailing = raw.match(TRAILING_PUNCTUATION)?.[0] ?? "";
    const href = trailing ? raw.slice(0, -trailing.length) : raw;
    parts.push({ text: href, href });
    if (trailing) parts.push({ text: trailing });
    cursor = index + raw.length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });

  const Tag = as;
  return (
    <Tag className={cn("whitespace-pre-wrap break-words", className)}>
      {parts.map((part, index) => part.href ? (
        <a
          key={`${part.href}-${index}`}
          href={part.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline decoration-primary/40 underline-offset-2 transition-colors duration-150 hover:decoration-primary"
          onClick={(event) => event.stopPropagation()}
        >
          {part.text}
        </a>
      ) : <Fragment key={index}>{part.text}</Fragment>)}
    </Tag>
  );
}
