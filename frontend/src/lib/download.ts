/** The name a `Content-Disposition` header gives the file, or "" when it gives none. */
export function fileNameOf(disposition: string | null): string {
  if (!disposition) return "";
  // A name with accents comes as filename*=utf-8''justificatif%20%C3%A9t%C3%A9.pdf
  const encoded = /filename\*\s*=\s*utf-8''([^;]+)/i.exec(disposition);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      // Not what it claims to be: fall back on the plain form.
    }
  }
  const quoted = /filename\s*=\s*"((?:[^"\\]|\\.)*)"/i.exec(disposition);
  if (quoted) return quoted[1].replace(/\\(.)/g, "$1");
  const bare = /filename\s*=\s*([^;]+)/i.exec(disposition);
  return bare ? bare[1].trim() : "";
}

/** Hands a file the API returned to the browser's download manager. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
