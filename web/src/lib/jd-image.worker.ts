/// <reference lib="webworker" />

interface ImagePreparationRequest {
  file: File;
  id: string;
  maxEdge: number;
  quality: number;
}

interface ImagePreparationResponse {
  blob?: Blob;
  error?: string;
  id: string;
}

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.addEventListener("message", (event: MessageEvent<ImagePreparationRequest>) => {
  void (async () => {
    const { file, id, maxEdge, quality } = event.data;
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d", { alpha: false });
      if (context === null) throw new Error("Canvas is unavailable.");
      context.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
      workerScope.postMessage({ id, blob } satisfies ImagePreparationResponse);
    } catch {
      workerScope.postMessage({ id, error: "IMAGE_PREPARATION_FAILED" } satisfies ImagePreparationResponse);
    }
  })();
});

export {};
