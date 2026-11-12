// Montage Lab — browser and capability detection (read-only).

export interface LabEnvironment {
  userAgent: string;
  browser: string;
  isBrave: boolean;
  android: string | null;
  chromeVersion: string | null;
  cores: number | null;
  deviceMemoryGB: number | null;
  crossOriginIsolated: boolean;
  apis: Record<string, boolean>;
  quota: number | null;
  usage: number | null;
  persisted: boolean | null;
}

type BraveNavigator = Navigator & {
  brave?: { isBrave?: () => Promise<boolean> };
  deviceMemory?: number;
  userAgentData?: { brands?: { brand: string; version: string }[] };
};

export async function detectEnvironment(): Promise<LabEnvironment> {
  const nav = navigator as BraveNavigator;
  let isBrave = false;
  try {
    isBrave = !!(nav.brave && (await nav.brave.isBrave?.()));
  } catch {
    isBrave = false;
  }
  const ua = nav.userAgent;
  const chromeVersion = /Chrome\/([\d.]+)/.exec(ua)?.[1] ?? null;
  const android = /Android ([\d.]+)/.exec(ua)?.[1] ?? null;
  const brands = nav.userAgentData?.brands?.map((b) => `${b.brand} ${b.version}`).join(", ");
  const browser = isBrave ? `Brave (Chromium ${chromeVersion ?? "?"})` : /SamsungBrowser\/([\d.]+)/.test(ua)
    ? `Samsung Internet ${/SamsungBrowser\/([\d.]+)/.exec(ua)![1]}`
    : chromeVersion ? `Chrome ${chromeVersion}` : brands ?? "unknown";

  const fsHandleProto = (globalThis as unknown as { FileSystemFileHandle?: { prototype: Record<string, unknown> } }).FileSystemFileHandle?.prototype;
  let canShareMp4 = false;
  try {
    const probe = new File([new Uint8Array([0, 0, 0, 8, 102, 114, 101, 101])], "probe.mp4", { type: "video/mp4" });
    canShareMp4 = typeof nav.canShare === "function" && nav.canShare({ files: [probe] });
  } catch {
    canShareMp4 = false;
  }
  const apis: Record<string, boolean> = {
    "OPFS (navigator.storage.getDirectory)": typeof nav.storage?.getDirectory === "function",
    "OPFS writable stream (createWritable)": typeof fsHandleProto?.createWritable === "function",
    "showSaveFilePicker (save-as dialog)": typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === "function",
    "navigator.share": typeof nav.share === "function",
    "canShare an MP4 file": canShareMp4,
    "Screen Wake Lock": typeof (nav as Navigator & { wakeLock?: unknown }).wakeLock === "object",
    "WebCodecs VideoEncoder": typeof VideoEncoder === "function",
    "WebCodecs VideoDecoder": typeof VideoDecoder === "function",
    "WebCodecs AudioEncoder": typeof AudioEncoder === "function",
    "storage.persist()": typeof nav.storage?.persist === "function",
    "performance.memory (non-standard)": !!(performance as Performance & { memory?: unknown }).memory,
  };
  let quota: number | null = null, usage: number | null = null, persisted: boolean | null = null;
  try {
    const e = await nav.storage.estimate();
    quota = e.quota ?? null;
    usage = e.usage ?? null;
  } catch {
    /* unavailable */
  }
  try {
    persisted = await nav.storage.persisted();
  } catch {
    persisted = null;
  }
  return {
    userAgent: ua, browser, isBrave, android, chromeVersion,
    cores: nav.hardwareConcurrency ?? null, deviceMemoryGB: nav.deviceMemory ?? null,
    crossOriginIsolated: !!globalThis.crossOriginIsolated, apis, quota, usage, persisted,
  };
}
