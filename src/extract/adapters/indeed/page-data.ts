type RecordValue = Record<string, unknown>;
export function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
}

// Read the serialized object without evaluating page JavaScript or entering the page world.
// Balance braces while respecting JSON strings, which can contain braces and escaped quotes.
export function readIndeedData(document: Document): RecordValue | null {
  const objects: RecordValue[] = [];
  for (const script of document.querySelectorAll('script:not([src])')) {
    const text = script.textContent || '';
    const marker = /\bwindow\._rootProps\s*=\s*\{/g;
    while (marker.exec(text)) {
      const start = marker.lastIndex - 1;
      let depth = 0, quoted = false, escaped = false;
      for (let end = start; end < text.length; end++) {
        const char = text[end];
        if (quoted) {
          if (escaped) escaped = false;
          else if (char === '\\') escaped = true;
          else if (char === '"') quoted = false;
        } else if (char === '"') quoted = true;
        else if (char === '{') depth++;
        else if (char === '}' && --depth === 0) {
          try {
            const data = record(record(JSON.parse(text.slice(start, end + 1))).preloadedVJData);
            if (typeof data.jobKey === 'string') objects.push(data);
          } catch { /* A changed serialization format is not executable fallback data. */ }
          marker.lastIndex = end + 1;
          break;
        }
      }
    }
  }
  return objects.length === 1 ? objects[0]! : null;
}
