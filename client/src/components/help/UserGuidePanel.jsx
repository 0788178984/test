import React, { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { docsAPI } from '../../api/client';
import { handleApiError } from '../../api/client';

function inlineMarkdown(text) {
  const parts = [];
  let rest = text;
  let key = 0;
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(
        <strong key={key++}>{token.slice(2, -2)}</strong>
      );
    } else if (token.startsWith('`')) {
      parts.push(
        <code key={key++} className="rounded bg-gray-100 px-1 py-0.5 text-sm font-mono text-gray-800">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('[')) {
      const m = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (m) {
        parts.push(
          <a
            key={key++}
            href={m[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 underline hover:text-primary-800"
          >
            {m[1]}
          </a>
        );
      }
    }
    last = match.index + token.length;
  }
  if (last < text.length) {
    parts.push(text.slice(last));
  }
  return parts.length ? parts : text;
}

function parseTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function isTableSeparator(line) {
  return /^\|?[\s:-]+\|[\s|:-]+\|?$/.test(line.trim());
}

function MarkdownBody({ content }) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      blocks.push(<hr key={blocks.length} className="my-6 border-gray-200" />);
      i += 1;
      continue;
    }

    if (line.startsWith('### ')) {
      blocks.push(
        <h3 key={blocks.length} className="mb-2 mt-5 text-base font-semibold text-gray-900">
          {inlineMarkdown(line.slice(4))}
        </h3>
      );
      i += 1;
      continue;
    }

    if (line.startsWith('## ')) {
      blocks.push(
        <h2 key={blocks.length} className="mb-3 mt-6 border-b border-gray-100 pb-2 text-lg font-bold text-gray-900">
          {inlineMarkdown(line.slice(3))}
        </h2>
      );
      i += 1;
      continue;
    }

    if (line.startsWith('# ')) {
      blocks.push(
        <h1 key={blocks.length} className="mb-4 text-xl font-bold text-gray-900">
          {inlineMarkdown(line.slice(2))}
        </h1>
      );
      i += 1;
      continue;
    }

    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = parseTableRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(parseTableRow(lines[i]));
        i += 1;
      }
      blocks.push(
        <div key={blocks.length} className="my-4 overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50">
              <tr>
                {header.map((cell, ci) => (
                  <th key={ci} className="px-3 py-2 font-semibold text-gray-800">
                    {inlineMarkdown(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className={ri % 2 ? 'bg-gray-50/50' : 'bg-white'}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 text-gray-700 align-top">
                      {inlineMarkdown(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (/^(\d+\.\s|[-*]\s)/.test(line.trim())) {
      const ordered = /^\d+\.\s/.test(line.trim());
      const items = [];
      while (i < lines.length && /^(\d+\.\s|[-*]\s)/.test(lines[i].trim())) {
        const raw = lines[i].trim().replace(/^(\d+\.\s|[-*]\s)/, '');
        items.push(raw);
        i += 1;
      }
      const ListTag = ordered ? 'ol' : 'ul';
      blocks.push(
        <ListTag
          key={blocks.length}
          className={`my-3 space-y-1 pl-5 text-sm text-gray-700 ${ordered ? 'list-decimal' : 'list-disc'}`}
        >
          {items.map((item, idx) => (
            <li key={idx}>{inlineMarkdown(item)}</li>
          ))}
        </ListTag>
      );
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('#') && !lines[i].trim().startsWith('|')) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={blocks.length} className="my-2 text-sm leading-relaxed text-gray-700">
        {inlineMarkdown(para.join(' '))}
      </p>
    );
  }

  return <article className="user-guide-doc">{blocks}</article>;
}

const UserGuidePanel = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [guide, setGuide] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await docsAPI.getUserGuide();
        if (!cancelled) setGuide(data);
      } catch (err) {
        if (!cancelled) {
          const { message } = handleApiError(err);
          setError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
        <BookOpen className="mb-3 h-10 w-10 animate-pulse text-primary-400" />
        <p className="text-sm">Loading user guide…</p>
      </div>
    );
  }

  if (error) {
    return <p className="py-8 text-center text-sm text-red-600">{error}</p>;
  }

  if (!guide?.content) {
    return <p className="py-8 text-center text-sm text-gray-500">User guide is not available.</p>;
  }

  return (
    <div className="max-h-[min(70vh,720px)] overflow-y-auto pr-1">
      <MarkdownBody content={guide.content} />
    </div>
  );
};

export default UserGuidePanel;
