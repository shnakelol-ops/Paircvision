import { crc32 as nodeCrc32, inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildZip, crc32, uniqueZipNames } from "./zip-store";

// Independent reader: walks the central directory, checks every local header
// matches it, and verifies each entry's CRC with Node's own zlib.crc32.
async function readZip(blob: Blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const dv = new DataView(buf.buffer);
  const eocd = buf.length - 22;
  expect(dv.getUint32(eocd, true)).toBe(0x06054b50);
  const count = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  expect(cdOffset + cdSize).toBe(eocd);
  const out: { name: string; data: Uint8Array }[] = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    expect(dv.getUint32(p, true)).toBe(0x02014b50);
    const method = dv.getUint16(p + 10, true);
    const crc = dv.getUint32(p + 16, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
    expect(dv.getUint32(local, true)).toBe(0x04034b50);
    expect(dv.getUint32(local + 14, true)).toBe(crc);
    const lNameLen = dv.getUint16(local + 26, true);
    const start = local + 30 + lNameLen + dv.getUint16(local + 28, true);
    const data = buf.subarray(start, start + size);
    const plain = method === 8 ? new Uint8Array(inflateRawSync(data)) : data;
    expect(nodeCrc32(plain) >>> 0).toBe(crc);
    out.push({ name, data: plain });
    p += 46 + nameLen;
  }
  return out;
}

describe("zip-store", () => {
  it("crc32 matches zlib", () => {
    const data = new TextEncoder().encode("PáircVision match clipper");
    expect(crc32(data)).toBe(nodeCrc32(data) >>> 0);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("writes an archive an independent reader can verify byte for byte", async () => {
    const big = new Uint8Array(300_000).map((_, i) => (i * 31) & 0xff);
    const entries = [
      { name: "01 Score — Conor.mp4", data: new Uint8Array([1, 2, 3]) },
      { name: "02 Kickout.mp4", data: big },
      { name: "03 empty.mp4", data: new Uint8Array() },
    ];
    const blob = buildZip(entries);
    expect(blob.type).toBe("application/zip");
    const read = await readZip(blob);
    expect(read.map((e) => e.name)).toEqual(entries.map((e) => e.name));
    read.forEach((e, i) => expect(e.data).toEqual(entries[i]!.data));
  });

  it("makes names unique and path-safe", () => {
    expect(uniqueZipNames(["a.mp4", "A.mp4", "a.mp4", "x/y:z.mp4", ""])).toEqual([
      "a.mp4", "A (2).mp4", "a (3).mp4", "x-y-z.mp4", "clip",
    ]);
  });

  it("an empty archive is still valid", async () => {
    expect(await readZip(buildZip([]))).toEqual([]);
  });
});
