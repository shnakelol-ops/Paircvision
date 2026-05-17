const AUDIO_DB_NAME = "audio-storage";
const AUDIO_DB_VERSION = 1;
const AUDIO_STORE_NAME = "voice-blobs";

function newAudioBlobId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && "randomUUID" in cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return `audio-${cryptoApi.randomUUID()}`;
  }
  return `audio-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function openAudioDb(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(AUDIO_DB_NAME, AUDIO_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(AUDIO_STORE_NAME)) {
        database.createObjectStore(AUDIO_STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open audio storage database"));
    };
  });
}

export async function saveVoiceBlob(blob: Blob): Promise<string> {
  const db = await openAudioDb();
  const blobId = newAudioBlobId();

  return new Promise<string>((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE_NAME, "readwrite");
    const store = tx.objectStore(AUDIO_STORE_NAME);
    const request = store.put(blob, blobId);

    request.onsuccess = () => {
      resolve(blobId);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to write audio blob"));
    };

    tx.onabort = () => {
      reject(tx.error ?? new Error("Audio write transaction aborted"));
    };

    tx.onerror = () => {
      reject(tx.error ?? new Error("Audio write transaction failed"));
    };
  }).finally(() => {
    db.close();
  });
}

export async function getVoiceBlob(blobId: string): Promise<Blob | null> {
  const db = await openAudioDb();

  return new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE_NAME, "readonly");
    const store = tx.objectStore(AUDIO_STORE_NAME);
    const request = store.get(blobId);

    request.onsuccess = () => {
      const value = request.result;
      resolve(value instanceof Blob ? value : null);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to read audio blob"));
    };

    tx.onabort = () => {
      reject(tx.error ?? new Error("Audio read transaction aborted"));
    };

    tx.onerror = () => {
      reject(tx.error ?? new Error("Audio read transaction failed"));
    };
  }).finally(() => {
    db.close();
  });
}
