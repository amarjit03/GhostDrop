
import { parseUrlKey } from "./key";

interface CapturedKey {
  dropId: string;
  fragment: string;
}

let capturedKey: CapturedKey | null = null;

/**
 * Capture and validate the decryption key from the browser URL.
 *
 * The key is retained only in module memory.
 * The URL fragment is removed immediately after capture.
 */
export function captureKey(dropId: string): string {
  if (typeof window === "undefined") {
    throw new Error("URL key can only be captured in the browser.");
  }

  // Reuse the key for the same drop if already captured.
  if (capturedKey?.dropId === dropId) {
    return capturedKey.fragment;
  }

  const fragment = window.location.hash;
  const cleanUrl =
    window.location.pathname + window.location.search;

  let keyBytes: Uint8Array;

  try {
    keyBytes = parseUrlKey(fragment);
  } catch (error) {
    // Remove even an invalid fragment from the visible URL.
    window.history.replaceState(
      window.history.state,
      "",
      cleanUrl,
    );

    throw error;
  }

  // Remove the temporary decoded bytes.
  keyBytes.fill(0);

  // Remove the secret from the visible URL and browser history entry.
  window.history.replaceState(
    window.history.state,
    "",
    cleanUrl,
  );

  capturedKey = {
    dropId,
    fragment,
  };

  return fragment;
}

/**
 * Clear the captured key after the decryption operation finishes.
 */
export function clearCapturedKey(dropId: string): void {
  if (capturedKey?.dropId === dropId) {
    capturedKey = null;
  }
}
