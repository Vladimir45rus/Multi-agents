"use client";

import Markdown from "react-markdown";

type MarkdownContentProps = {
  content: string;
  className?: string;
};

const markdownComponents = {
  code({ className, children, ...props }: React.HTMLAttributes<HTMLElement> & { inline?: boolean }) {
    const isInline = !className?.includes("language-");
    if (isInline) {
      return (
        <code
          className="rounded bg-[#2d2d30] px-1 py-0.5 text-[10px] text-[#d4d4d4]"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <pre className="my-1 overflow-auto rounded border border-[#3a3d41] bg-[#1e1e1e] p-2">
        <code className={`text-[10px] leading-relaxed text-[#d4d4d4] ${className ?? ""}`} {...props}>
          {children}
        </code>
      </pre>
    );
  },
  p({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
    return (
      <p className="mb-1 last:mb-0 text-inherit" {...props}>
        {children}
      </p>
    );
  },
  ul({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) {
    return (
      <ul className="my-1 list-inside list-disc space-y-0.5 text-inherit" {...props}>
        {children}
      </ul>
    );
  },
  ol({ children, ...props }: React.HTMLAttributes<HTMLOListElement>) {
    return (
      <ol className="my-1 list-inside list-decimal space-y-0.5 text-inherit" {...props}>
        {children}
      </ol>
    );
  },
  li({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) {
    return (
      <li className="text-inherit" {...props}>
        {children}
      </li>
    );
  },
  strong({ children, ...props }: React.HTMLAttributes<HTMLElement>) {
    return (
      <strong className="font-semibold text-white" {...props}>
        {children}
      </strong>
    );
  },
  h1({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
    return <h1 className="mb-1 text-sm font-bold text-white" {...props}>{children}</h1>;
  },
  h2({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
    return <h2 className="mb-1 text-xs font-bold text-white" {...props}>{children}</h2>;
  },
  h3({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
    return <h3 className="mb-1 text-xs font-semibold text-[#d4d4d4]" {...props}>{children}</h3>;
  },
  blockquote({ children, ...props }: React.HTMLAttributes<HTMLQuoteElement>) {
    return (
      <blockquote className="my-1 border-l-2 border-[#3a3d41] pl-2 text-[#9da3b2]" {...props}>
        {children}
      </blockquote>
    );
  },
  a({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#4fc1ff] underline"
        {...props}
      >
        {children}
      </a>
    );
  },
};

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  if (!content) return null;

  return (
    <div className={`prose-invert text-xs leading-relaxed text-inherit ${className ?? ""}`}>
      <Markdown components={markdownComponents}>{content}</Markdown>
    </div>
  );
}
