import { afterEach, describe, expect, it, vi } from "vitest";
import { fileNameOf, saveBlob } from "./download";

describe("fileNameOf", () => {
  it("reads a plain name", () => {
    expect(fileNameOf('attachment; filename="journal-securite.xlsx"')).toBe("journal-securite.xlsx");
    expect(fileNameOf("attachment; filename=contrat.pdf")).toBe("contrat.pdf");
  });

  it("reads a name with accents", () => {
    expect(fileNameOf("attachment; filename*=utf-8''justificatif%20%C3%A9t%C3%A9.pdf")).toBe("justificatif été.pdf");
  });

  it("reads a name with quotation marks in it", () => {
    expect(fileNameOf('attachment; filename="le \\"bon\\" contrat.pdf"')).toBe('le "bon" contrat.pdf');
  });

  it("gives nothing when the header gives no name", () => {
    expect(fileNameOf(null)).toBe("");
    expect(fileNameOf("attachment")).toBe("");
  });

  it("falls back on the plain name when the encoded one cannot be read", () => {
    expect(fileNameOf("attachment; filename=\"contrat.pdf\"; filename*=utf-8''%E0%A4%A")).toBe("contrat.pdf");
  });
});

describe("saveBlob", () => {
  afterEach(() => {
    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
  });

  it("gives the browser the content under the name of the file", () => {
    // jsdom has no object URLs and follows no link.
    const given: Blob[] = [];
    Object.assign(URL, {
      createObjectURL: (blob: Blob) => {
        given.push(blob);
        return "blob:iris/1";
      },
      revokeObjectURL: vi.fn(),
    });
    const followed: { address: string | null; name: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      followed.push({ address: this.getAttribute("href"), name: this.download });
    });
    const blob = new Blob(["%PDF-1.4"], { type: "application/pdf" });

    saveBlob(blob, "contrat.pdf");

    expect(given).toEqual([blob]);
    expect(followed).toEqual([{ address: "blob:iris/1", name: "contrat.pdf" }]);
    expect(document.querySelector("a[download]")).toBeNull();
  });
});
