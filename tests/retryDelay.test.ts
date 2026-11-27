import { describe, it, expect } from "vitest";
import { computeRetryDelayMs } from "../src/worker.js";

describe("computeRetryDelayMs", () => {
    it("Test 1: can return zero (minimum possible delay)", () => {
        expect(
            computeRetryDelayMs(1, { baseMs: 100, capMs: 2000 }, () => 0)
        ).toBe(0);
    });

    it("Test 2: stays just below the ceiling (maximum possible delay)", () => {
        const result = computeRetryDelayMs(
            1,
            { baseMs: 100, capMs: 2000 },
            () => 0.999
        );

        expect(result).toBe(99);
        expect(result).toBeLessThan(100); // must never reach the ceiling itself
    });

    it.each([ //this enables to run the same test on multiple inputs
        [1, 99],
        [2, 199],
        [3, 399],
        [4, 799],
    ])(
        "Test 3: ceiling doubles every attempt (attempt %i -> %i)",
        (attemptCount, expected) => {
            expect(
                computeRetryDelayMs(
                    attemptCount,
                    { baseMs: 100, capMs: 2000 },
                    () => 0.999
                )
            ).toBe(expected);
        }
    );

    it.each([
        [1, 99],
        [2, 199],
        [3, 399],
        [4, 499],
        [5, 499],
        [6, 499],
    ])(
        "Test 4: ceiling stops growing at capMs (attempt %i -> %i)",
        (attemptCount, expected) => {
            expect(
                computeRetryDelayMs(
                    attemptCount,
                    { baseMs: 100, capMs: 500 },
                    () => 0.999
                )
            ).toBe(expected);
        }
    );

    it("Test 5: very large attempt counts stay finite (no Infinity/NaN)", () => {
        const result = computeRetryDelayMs(
            10000,
            { baseMs: 100, capMs: 2000 },
            () => 0.5
        );

        expect(Number.isFinite(result)).toBe(true);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThan(2000);
    });
});
