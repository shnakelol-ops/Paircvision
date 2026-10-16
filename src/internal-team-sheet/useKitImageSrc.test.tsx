// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";

import { useKitImage, useKitImageSrc } from "./useKitImageSrc";
import { createMemoryKitImageBackend, type KitImageBackend } from "./team-sheet-kit-store";
import { PRESET_KITS, type TeamSheetKit } from "./team-sheet-kits";

// jsdom has no object URLs; stand-ins that record what was revoked.
let created: string[];
let revoked: Set<string>;
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;

beforeEach(() => {
  created = [];
  revoked = new Set();
  URL.createObjectURL = () => {
    const url = `blob:test/${created.length + 1}`;
    created.push(url);
    return url;
  };
  URL.revokeObjectURL = (url: string) => void revoked.add(url);
});

afterEach(() => {
  cleanup();
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

const GK_PRESET = PRESET_KITS.find((k) => k.role === "gk")!;
const userKit = (id: string): TeamSheetKit => ({ id, teamId: "ballylanders", name: id, role: "gk", source: "user" });

// Records every rendered src together with whether it was already revoked
// at the moment it rendered — the exact failure the audit reproduced.
function renderProbe(backend: KitImageBackend, kit: TeamSheetKit) {
  const renders: Array<{ src: string; deadAtRender: boolean }> = [];
  function Probe({ kit }: { kit: TeamSheetKit }) {
    const src = useKitImageSrc(kit, backend);
    renders.push({ src, deadAtRender: revoked.has(src) });
    return null;
  }
  const view = render(<Probe kit={kit} />);
  return { renders, rerender: (k: TeamSheetKit) => view.rerender(<Probe kit={k} />), unmount: view.unmount };
}

async function backendWith(...ids: string[]) {
  const backend = createMemoryKitImageBackend();
  for (const id of ids) await backend.put(id, new Blob([id]));
  return backend;
}

describe("useKitImageSrc", () => {
  it("never renders a revoked URL when switching uploaded → preset → uploaded", async () => {
    const backend = await backendWith("user:a");
    const probe = renderProbe(backend, userKit("user:a"));
    await waitFor(() => expect(probe.renders.at(-1)!.src).toBe("blob:test/1"));

    probe.rerender(GK_PRESET);
    expect(revoked.has("blob:test/1")).toBe(true);
    probe.rerender(userKit("user:a"));
    // While reloading it shows the preset fallback, then the fresh URL.
    expect(probe.renders.at(-1)!.src).toBe(GK_PRESET.src);
    await waitFor(() => expect(probe.renders.at(-1)!.src).toBe("blob:test/2"));

    expect(probe.renders.filter((r) => r.deadAtRender)).toEqual([]);
  });

  it("never renders a revoked URL when switching between two uploaded kits", async () => {
    const backend = await backendWith("user:a", "user:b");
    const probe = renderProbe(backend, userKit("user:a"));
    await waitFor(() => expect(probe.renders.at(-1)!.src).toBe("blob:test/1"));
    probe.rerender(userKit("user:b"));
    await waitFor(() => expect(probe.renders.at(-1)!.src).toBe("blob:test/2"));
    probe.rerender(userKit("user:a"));
    await waitFor(() => expect(probe.renders.at(-1)!.src).toBe("blob:test/3"));
    expect(probe.renders.filter((r) => r.deadAtRender)).toEqual([]);
  });

  it("revokes every URL it created by unmount, and creates none if unmounted before load", async () => {
    const backend = await backendWith("user:a");
    const probe = renderProbe(backend, userKit("user:a"));
    await waitFor(() => expect(created).toHaveLength(1));
    probe.unmount();
    expect(created.every((u) => revoked.has(u))).toBe(true);

    let release!: (b: Blob | null) => void;
    const slow: KitImageBackend = { ...backend, get: () => new Promise((r) => (release = r)) };
    const early = renderProbe(slow, userKit("user:slow"));
    early.unmount();
    await act(async () => release(new Blob(["late"])));
    expect(created).toHaveLength(1);
  });

  it("keeps the role's preset fallback when the uploaded image is missing", async () => {
    const backend = await backendWith();
    const probe = renderProbe(backend, userKit("user:gone"));
    await act(async () => {});
    expect(probe.renders.every((r) => r.src === GK_PRESET.src)).toBe(true);
    expect(created).toHaveLength(0);
  });
});

describe("useKitImage status", () => {
  function StatusProbe({ kit, backend, out }: { kit: TeamSheetKit; backend: KitImageBackend; out: string[] }) {
    const { status } = useKitImage(kit, backend);
    out.push(status);
    return null;
  }

  it("is ready for presets, loading then ready for a stored kit, and missing when the image is gone", async () => {
    const backend = await backendWith("user:a");
    const preset: string[] = [];
    render(<StatusProbe kit={GK_PRESET} backend={backend} out={preset} />);
    expect(preset.at(-1)).toBe("ready");
    cleanup();

    const stored: string[] = [];
    render(<StatusProbe kit={userKit("user:a")} backend={backend} out={stored} />);
    expect(stored[0]).toBe("loading");
    await waitFor(() => expect(stored.at(-1)).toBe("ready"));
    cleanup();

    const missing: string[] = [];
    render(<StatusProbe kit={userKit("user:gone")} backend={backend} out={missing} />);
    await waitFor(() => expect(missing.at(-1)).toBe("missing"));
  });
});
