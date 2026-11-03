import { readBarcodesFromImageData, setZXingModuleOverrides } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

export interface QrWorkerRequest {
  type: 'QR_DECODE';
  imageData: ImageData;
}

export type QrWorkerResponse =
  | { type: 'QR_RESULT'; pseudonymId: string; version: string; fallbackCode?: string; rawText?: string }
  | { type: 'ERROR'; message: string };

// Self-hosted: the library's default fetches the WASM from jsDelivr, which CSP connect-src blocks (no QR was ever read) and which would leak the user's IP.
setZXingModuleOverrides({
  locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? new URL(wasmUrl, self.location.href).href : prefix + path),
});

/** `BG:pseudonym:version:fallback` codes split into parts; any other payload (a name sticker) is its own pseudonym. */
export function qrResultOf(rawValue: string): QrWorkerResponse {
  const parts = rawValue.split(':');
  if (parts[0] === 'BG' && parts.length >= 3) {
    return { type: 'QR_RESULT', pseudonymId: parts[1], version: parts[2], fallbackCode: parts[3], rawText: rawValue };
  }
  return { type: 'QR_RESULT', pseudonymId: rawValue, version: 'A', fallbackCode: rawValue, rawText: rawValue };
}

async function decode(imageData: ImageData): Promise<string | null> {
  try {
    const results = await readBarcodesFromImageData(imageData, { formats: ['QRCode'], maxNumberOfSymbols: 1 });
    if (results.length > 0) return results[0].text;
  } catch (wasmErr) {
    console.warn('ZXing-wasm decode error, trying BarcodeDetector fallback:', wasmErr);
  }
  if ('BarcodeDetector' in self) {
    const detector = new (self as any).BarcodeDetector({ formats: ['qr_code'] });
    const barcodes = await detector.detect(imageData);
    if (barcodes.length > 0) return barcodes[0].rawValue;
  }
  return null;
}

self.onmessage = async (event: MessageEvent<QrWorkerRequest>) => {
  try {
    const rawValue = await decode(event.data.imageData);
    self.postMessage(rawValue === null ? { type: 'ERROR', message: 'No readable QR code found on page.' } : qrResultOf(rawValue));
  } catch (err: any) {
    self.postMessage({ type: 'ERROR', message: err.message || 'QR decoding error' });
  }
};
