
import { afterEach, describe, expect, it, vi } from "vitest";

import { generateUrlKey } from "./key";
import {
    captureKey,
    clearCapturedKey,
} from "./key-store";

describe("key store", () => {
    afterEach(() => {
        clearCapturedKey("drop-123");
        vi.unstubAllGlobals();
    });


    function mockBrowser(hash: string) {
        const location = {
            hash,
            pathname: "/d/drop-123",
            search: "?source=test",
        };

        const replaceState = vi.fn(() => {
            // Simulate the browser updating its URL.
            location.hash = "";
        });

        vi.stubGlobal("window", {
            location,
            history: {
                state: { test: true },
                replaceState,
            },
        });

        return replaceState;
    }


    it("captures and validates a URL key", () => {
        const generated = generateUrlKey();
        const replaceState = mockBrowser(generated.fragment);

        expect(captureKey("drop-123")).toBe(generated.fragment);

        expect(replaceState).toHaveBeenCalledWith(
            { test: true },
            "",
            "/d/drop-123?source=test",
        );
    });

    it("reuses the captured key for the same drop", () => {
        const generated = generateUrlKey();
        const replaceState = mockBrowser(generated.fragment);

        const first = captureKey("drop-123");
        const second = captureKey("drop-123");

        expect(first).toBe(second);
        expect(replaceState).toHaveBeenCalledTimes(1);
    });

    it("rejects a missing key", () => {
        const replaceState = mockBrowser("");

        expect(() => captureKey("drop-123")).toThrow();

        expect(replaceState).toHaveBeenCalledTimes(1);
    });

    it("rejects an invalid key", () => {
        const replaceState = mockBrowser("#invalid");

        expect(() => captureKey("drop-123")).toThrow();

        expect(replaceState).toHaveBeenCalledTimes(1);
    });

    it("clears the captured key", () => {
        const generated = generateUrlKey();
        mockBrowser(generated.fragment);

        captureKey("drop-123");
        clearCapturedKey("drop-123");

        expect(() => captureKey("drop-123")).toThrow();
    });
});
