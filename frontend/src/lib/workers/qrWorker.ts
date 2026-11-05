import { readBarcodesFromImageData, setZXingModuleOverrides } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

export interface QrWorkerRequest {
  type: 'QR_DECODE';
  imageData: ImageData;
}

/** Every QR text on the page: a name sticker and, on multi-sheet exams, the page code (issue #220). */
export type QrWorkerResponse = { type: 'QR_CODES'; texts: string[] } | { type: 'ERROR'; message: string };

/** A page holds at most a sticker, the cover's printed code and the page code. */
const MAX_SYMBOLS = 4;

// Self-hosted: the library's default fetches the WASM from jsDelivr, which CSP connect-src blocks (no QR was ever read) and which would leak the user's IP.
setZXingModuleOverrides({
  locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? new URL(wasmUrl, self.location.href).href : prefix + path),
});

async function decode(imageData: ImageData): Promise<string[]> {
  try {
    const results = await readBarcodesFromImageData(imageData, { formats: ['QRCode'], maxNumberOfSymbols: MAX_SYMBOLS });
    if (results.length > 0) return results.map((r) => r.text);
  } catch (wasmErr) {
    console.warn('ZXing-wasm decode error, trying BarcodeDetector fallback:', wasmErr);
  }
  if ('BarcodeDetector' in self) {
    const detector = new (self as any).BarcodeDetector({ formats: ['qr_code'] });
    const barcodes: { rawValue: string }[] = await detector.detect(imageData);
    return barcodes.map((b) => b.rawValue);
  }
  return [];
}

self.onmessage = async (event: MessageEvent<QrWorkerRequest>) => {
  try {
    const texts = await decode(event.data.imageData);
    const response: QrWorkerResponse = texts.length ? { type: 'QR_CODES', texts } : { type: 'ERROR', message: 'No readable QR code found on page.' };
    self.postMessage(response);
  } catch (err: any) {
    self.postMessage({ type: 'ERROR', message: err.message || 'QR decoding error' });
  }
};
