export type CodeLanguage =
  | 'html'
  | 'css'
  | 'js'
  | 'ts'
  | 'json'
  | 'md'
  | 'sql'
  | 'xml'
  | 'yaml'
  | 'text';

export interface CodeLanguageMeta {
  id: CodeLanguage;
  label: string;
  ext: string;
  mimeType: string;
  accentColor: string;
  badgeBg: string;
  badgeText: string;
  defaultFileName: string;
  starterCode: string;
}

export const CODE_LANGUAGES: CodeLanguageMeta[] = [
  {
    id: 'html',
    label: 'HTML',
    ext: '.html',
    mimeType: 'text/html',
    accentColor: '#FF6B35',
    badgeBg: '#FFF1EB',
    badgeText: '#C2410C',
    defaultFileName: 'index.html',
    starterCode: `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Công cụ mới</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
      margin: 0;
      padding: 24px;
      background: #fafafa;
      color: #17130f;
    }
    button {
      background: #17130f;
      color: #fff;
      border: 0;
      border-radius: 10px;
      padding: 10px 16px;
      font-size: 14px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <h1>Xin chào YunzyHub</h1>
  <p id="count">Số lần bấm: 0</p>
  <button id="btn">Tăng +1</button>

  <script>
    let n = 0;
    document.getElementById('btn').addEventListener('click', () => {
      n += 1;
      document.getElementById('count').textContent = 'Số lần bấm: ' + n;
    });
  </script>
</body>
</html>
`,
  },
  {
    id: 'md',
    label: 'Markdown',
    ext: '.md',
    mimeType: 'text/markdown',
    accentColor: '#0284C7',
    badgeBg: '#E0F2FE',
    badgeText: '#0369A1',
    defaultFileName: 'ghi-chu.md',
    starterCode: `# Ghi chú mới

Viết nội dung **Markdown** tại đây.

- Hỗ trợ danh sách
- Hỗ trợ \`mã nguồn\` và bảng biểu

> Mọi thay đổi được lưu cục bộ trong YunzyHub.
`,
  },
  {
    id: 'js',
    label: 'JavaScript',
    ext: '.js',
    mimeType: 'text/javascript',
    accentColor: '#D97706',
    badgeBg: '#FEF3C7',
    badgeText: '#B45309',
    defaultFileName: 'script.js',
    starterCode: `// Đoạn mã JavaScript
function formatCurrency(amount) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount);
}

console.log(formatCurrency(250000));
`,
  },
  {
    id: 'css',
    label: 'CSS',
    ext: '.css',
    mimeType: 'text/css',
    accentColor: '#4F46E5',
    badgeBg: '#EEF2FF',
    badgeText: '#4338CA',
    defaultFileName: 'styles.css',
    starterCode: `/* Kiểu giao diện */
:root {
  --bg: #ffffff;
  --ink: #17130f;
  --accent: #ff6b35;
}

body {
  background: var(--bg);
  color: var(--ink);
  margin: 0;
}
`,
  },
  {
    id: 'json',
    label: 'JSON',
    ext: '.json',
    mimeType: 'application/json',
    accentColor: '#059669',
    badgeBg: '#D1FAE5',
    badgeText: '#047857',
    defaultFileName: 'data.json',
    starterCode: `{
  "name": "YunzyHub",
  "version": "1.0.0",
  "active": true,
  "items": ["HTML", "Markdown", "PDF", "DOCX"]
}
`,
  },
  {
    id: 'ts',
    label: 'TypeScript',
    ext: '.ts',
    mimeType: 'text/typescript',
    accentColor: '#2563EB',
    badgeBg: '#DBEAFE',
    badgeText: '#1D4ED8',
    defaultFileName: 'index.ts',
    starterCode: `interface Task {
  id: number;
  title: string;
  done: boolean;
}

const tasks: Task[] = [
  { id: 1, title: 'Khởi tạo dự án', done: true },
];
`,
  },
  {
    id: 'sql',
    label: 'SQL',
    ext: '.sql',
    mimeType: 'application/sql',
    accentColor: '#7C3AED',
    badgeBg: '#EDE9FE',
    badgeText: '#6D28D9',
    defaultFileName: 'query.sql',
    starterCode: `-- Truy vấn mẫu
SELECT id, name, created_at
FROM tools
WHERE favorite = true
ORDER BY created_at DESC;
`,
  },
  {
    id: 'text',
    label: 'Text',
    ext: '.txt',
    mimeType: 'text/plain',
    accentColor: '#52525B',
    badgeBg: '#F4F4F5',
    badgeText: '#3F3F46',
    defaultFileName: 'note.txt',
    starterCode: '',
  },
];

export function getLanguageMeta(lang: CodeLanguage): CodeLanguageMeta {
  return (
    CODE_LANGUAGES.find((item) => item.id === lang) ||
    CODE_LANGUAGES[CODE_LANGUAGES.length - 1]
  );
}

export function detectCodeLanguage(filePath?: string): CodeLanguage {
  if (!filePath) return 'text';
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  if (lower.endsWith('.css') || lower.endsWith('.scss') || lower.endsWith('.less')) return 'css';
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.jsx')) return 'js';
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'ts';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'md';
  if (lower.endsWith('.sql')) return 'sql';
  if (lower.endsWith('.xml') || lower.endsWith('.svg')) return 'xml';
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml';
  return 'text';
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function span(color: string, text: string, extraStyle = ''): string {
  return `<span style="color:${color};${extraStyle}">${escapeHtml(text)}</span>`;
}

function highlightJsLike(code: string): string {
  const tokenRegex =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|`(?:\\[\s\S]|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|class|extends|new|try|catch|finally|throw|async|await|import|export|from|default|typeof|instanceof|in|of|interface|type|enum|implements|public|private|readonly|as|void)\b|\b(?:true|false|null|undefined|NaN)\b|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*(?=\s*\())/g;

  let out = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      out += escapeHtml(code.slice(lastIndex, match.index));
    }
    const tok = match[0];
    if (tok.startsWith('//') || tok.startsWith('/*')) {
      out += span('#8C959F', tok, 'font-style:italic;');
    } else if (tok.startsWith('"') || tok.startsWith("'") || tok.startsWith('`')) {
      out += span('#047857', tok);
    } else if (/^(true|false|null|undefined|NaN)$/.test(tok)) {
      out += span('#D97706', tok, 'font-weight:500;');
    } else if (/^\d/.test(tok)) {
      out += span('#C2410C', tok);
    } else if (
      /^(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|class|extends|new|try|catch|finally|throw|async|await|import|export|from|default|typeof|instanceof|in|of|interface|type|enum|implements|public|private|readonly|as|void)$/.test(
        tok
      )
    ) {
      out += span('#9333EA', tok, 'font-weight:600;');
    } else {
      out += span('#0369A1', tok);
    }
    lastIndex = match.index + tok.length;
  }

  if (lastIndex < code.length) {
    out += escapeHtml(code.slice(lastIndex));
  }
  return out;
}

function highlightCss(code: string): string {
  const tokenRegex =
    /(\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|@[a-zA-Z-]+|#[0-9a-fA-F]{3,8}\b|--[a-zA-Z0-9_-]+|\b[a-zA-Z-]+(?=\s*:)|\b\d+(?:\.\d+)?(?:px|rem|em|vh|vw|dvh|%|s|ms|deg|fr)?\b)/g;

  let out = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      out += escapeHtml(code.slice(lastIndex, match.index));
    }
    const tok = match[0];
    if (tok.startsWith('/*')) {
      out += span('#8C959F', tok, 'font-style:italic;');
    } else if (tok.startsWith('"') || tok.startsWith("'")) {
      out += span('#047857', tok);
    } else if (tok.startsWith('@')) {
      out += span('#9333EA', tok, 'font-weight:600;');
    } else if (tok.startsWith('#')) {
      out += span('#7C3AED', tok, 'font-weight:500;');
    } else if (tok.startsWith('--')) {
      out += span('#C2410C', tok);
    } else if (/^\d/.test(tok)) {
      out += span('#059669', tok);
    } else {
      out += span('#0369A1', tok);
    }
    lastIndex = match.index + tok.length;
  }

  if (lastIndex < code.length) {
    out += escapeHtml(code.slice(lastIndex));
  }
  return out;
}

function highlightJson(code: string): string {
  const tokenRegex =
    /("(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let out = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      out += escapeHtml(code.slice(lastIndex, match.index));
    }
    const tok = match[0];
    if (tok.endsWith(':')) {
      const colonIdx = tok.lastIndexOf(':');
      out += span('#0369A1', tok.slice(0, colonIdx), 'font-weight:500;') + escapeHtml(tok.slice(colonIdx));
    } else if (tok.startsWith('"')) {
      out += span('#047857', tok);
    } else if (/^(true|false|null)$/.test(tok)) {
      out += span('#9333EA', tok, 'font-weight:600;');
    } else {
      out += span('#C2410C', tok);
    }
    lastIndex = match.index + tok.length;
  }
  if (lastIndex < code.length) {
    out += escapeHtml(code.slice(lastIndex));
  }
  return out;
}

function highlightHtmlTag(tagText: string): string {
  if (tagText.startsWith('<!--')) {
    return span('#8C959F', tagText, 'font-style:italic;');
  }
  if (/^<!DOCTYPE/i.test(tagText)) {
    return span('#0284C7', tagText, 'font-weight:600;');
  }
  const match = tagText.match(/^(<\/?)([A-Za-z0-9:-]+)([\s\S]*?)(\/?>)$/);
  if (!match) return escapeHtml(tagText);

  const [, open, tagName, attrs, close] = match;
  let highlightedAttrs = '';
  const attrRegex = /([A-Za-z0-9:@._-]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)|([A-Za-z0-9:@._-]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = attrRegex.exec(attrs)) !== null) {
    if (m.index > last) {
      highlightedAttrs += escapeHtml(attrs.slice(last, m.index));
    }
    if (m[1]) {
      highlightedAttrs +=
        span('#6D28D9', m[1]) +
        escapeHtml(m[2]) +
        span('#047857', m[3]);
    } else if (m[4]) {
      highlightedAttrs += span('#6D28D9', m[4]);
    }
    last = m.index + m[0].length;
  }
  if (last < attrs.length) {
    highlightedAttrs += escapeHtml(attrs.slice(last));
  }

  return (
    span('#64748B', open) +
    span('#C2410C', tagName, 'font-weight:600;') +
    highlightedAttrs +
    span('#64748B', close)
  );
}

function highlightHtml(code: string): string {
  const tokenRegex = /(<!--[\s\S]*?-->|<![A-Za-z][^>]*>|<\/?[A-Za-z][^>]*>)/g;
  let out = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      out += escapeHtml(code.slice(lastIndex, match.index));
    }
    out += highlightHtmlTag(match[0]);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < code.length) {
    out += escapeHtml(code.slice(lastIndex));
  }
  return out;
}

function highlightMarkdown(code: string): string {
  return code
    .split('\n')
    .map((line) => {
      if (/^#{1,6}\s/.test(line)) {
        return span('#C2410C', line, 'font-weight:700;');
      }
      if (/^\s*>\s?/.test(line)) {
        return span('#64748B', line, 'font-style:italic;');
      }
      if (/^\s*```/.test(line)) {
        return span('#7C3AED', line, 'font-weight:600;');
      }
      const inlineRegex = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|^\s*[-*+]\s)/g;
      let out = '';
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = inlineRegex.exec(line)) !== null) {
        if (m.index > last) {
          out += escapeHtml(line.slice(last, m.index));
        }
        const tok = m[0];
        if (tok.startsWith('`')) {
          out += span('#7C3AED', tok, 'background:#F3E8FF;border-radius:3px;');
        } else if (tok.startsWith('**')) {
          out += span('#17130F', tok, 'font-weight:700;');
        } else if (tok.startsWith('[')) {
          out += span('#0284C7', tok);
        } else {
          out += span('#FF6B35', tok, 'font-weight:700;');
        }
        last = m.index + tok.length;
      }
      if (last < line.length) {
        out += escapeHtml(line.slice(last));
      }
      return out;
    })
    .join('\n');
}

function highlightSql(code: string): string {
  const tokenRegex =
    /(--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|\b(?:SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|ALTER|DROP|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|BY|ORDER|ASC|DESC|LIMIT|OFFSET|AND|OR|NOT|NULL|AS|DISTINCT|COUNT|SUM|AVG|MIN|MAX|HAVING|CASE|WHEN|THEN|ELSE|END)\b|\b\d+(?:\.\d+)?\b)/gi;
  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = tokenRegex.exec(code)) !== null) {
    if (m.index > last) {
      out += escapeHtml(code.slice(last, m.index));
    }
    const tok = m[0];
    if (tok.startsWith('--') || tok.startsWith('/*')) {
      out += span('#8C959F', tok, 'font-style:italic;');
    } else if (tok.startsWith("'")) {
      out += span('#047857', tok);
    } else if (/^\d/.test(tok)) {
      out += span('#C2410C', tok);
    } else {
      out += span('#2563EB', tok, 'font-weight:600;');
    }
    last = m.index + tok.length;
  }
  if (last < code.length) {
    out += escapeHtml(code.slice(last));
  }
  return out;
}

function highlightYaml(code: string): string {
  return code
    .split('\n')
    .map((line) => {
      if (/^\s*#/.test(line)) {
        return span('#8C959F', line, 'font-style:italic;');
      }
      const match = line.match(/^(\s*[^:\n]+)(:)(.*)$/);
      if (match) {
        return (
          span('#0369A1', match[1], 'font-weight:500;') +
          escapeHtml(match[2]) +
          span('#047857', match[3])
        );
      }
      return escapeHtml(line);
    })
    .join('\n');
}

/**
 * Produces syntax-highlighted HTML for Light Mode code editing/viewing.
 */
export function highlightCodeLight(code: string, language: CodeLanguage): string {
  if (!code) return '';
  switch (language) {
    case 'html':
    case 'xml':
      return highlightHtml(code);
    case 'css':
      return highlightCss(code);
    case 'js':
    case 'ts':
      return highlightJsLike(code);
    case 'json':
      return highlightJson(code);
    case 'md':
      return highlightMarkdown(code);
    case 'sql':
      return highlightSql(code);
    case 'yaml':
      return highlightYaml(code);
    case 'text':
    default:
      return escapeHtml(code);
  }
}
