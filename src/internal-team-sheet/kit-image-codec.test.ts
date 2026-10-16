import { describe, expect, it } from "vitest";
import { ACCEPT_ATTRIBUTE, MAX_UPLOAD_BYTES, validateUpload } from "./kit-image-codec";

describe("validateUpload", () => {
  it("accepts JPG, PNG and WebP", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) expect(validateUpload({ type, size: 1000 })).toBeNull();
    expect(ACCEPT_ATTRIBUTE).toBe("image/jpeg,image/png,image/webp");
  });
  it("rejects other types, including HEIC and GIF", () => {
    for (const type of ["image/heic", "image/gif", "application/pdf", ""]) {
      expect(validateUpload({ type, size: 1000 })).toMatch(/JPG, PNG or WebP/);
    }
  });
  it("rejects empty and oversized files", () => {
    expect(validateUpload({ type: "image/jpeg", size: 0 })).toMatch(/empty/);
    expect(validateUpload({ type: "image/jpeg", size: MAX_UPLOAD_BYTES + 1 })).toMatch(/too large/);
  });
});
