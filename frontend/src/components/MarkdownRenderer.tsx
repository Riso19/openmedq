import { useMemo } from 'react';
import { marked } from 'marked';

interface MarkdownRendererProps {
  content: string;
  inline?: boolean;
}

export function MarkdownRenderer({ content, inline = false }: MarkdownRendererProps) {
  const parsedHTML = useMemo(() => {
    if (!content) return '';
    try {
      // Pre-process custom sub/superscript shorthand:
      // Replace ~subscript~ with <sub>subscript</sub>
      // Replace ^superscript^ with <sup>superscript</sup>
      const cdnUrl = import.meta.env.VITE_CDN_URL || `${import.meta.env.VITE_API_URL || ''}/api/assets`;
      let processed = content
        .replace(/~([^~]+)~/g, '<sub>$1</sub>')
        .replace(/\^([^^]+)\^/g, '<sup>$1</sup>');

      // Resolve relative image paths to the CDN base URL
      processed = processed
        .replace(/\((?:https?:\/\/[^)]+)?\/?(images\/[^)]+)\)/g, `(${cdnUrl}/$1)`)
        .replace(/src=["']\/?(images\/[^"']+)["']/g, `src="${cdnUrl}/$1"`);

      // Parse markdown to HTML using marked
      let html = marked.parse(processed, { async: false }) as string;

      if (inline) {
        // Strip wrapping paragraph tags if inline
        html = html.replace(/^<p>/i, '').replace(/<\/p>\s*$/i, '');
      }

      return html;
    } catch (e) {
      console.error('Error parsing markdown:', e);
      return content;
    }
  }, [content, inline]);

  if (inline) {
    return (
      <span
        className="markdown-content inline"
        dangerouslySetInnerHTML={{ __html: parsedHTML }}
      />
    );
  }

  return (
    <div
      className="markdown-content"
      dangerouslySetInnerHTML={{ __html: parsedHTML }}
    />
  );
}
