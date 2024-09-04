import { afterEach } from "vitest";
import { server } from "./src/mocks/server";
import { beforeAll, afterAll, beforeEach, vi } from "vitest";

beforeAll(() => {
    server.listen()
})

afterAll(() => {
    server.close()
})

beforeEach(() => {
    server.resetHandlers()
})

afterEach(() => {
    server.resetHandlers()
})

beforeAll(() => {
    const _jest = (globalThis as any).jest;

    (globalThis as any).jest = {
        ...(globalThis as any).jest,
        advanceTimersByTime: vi.advanceTimersByTime.bind(vi)
    };

    vi.useFakeTimers();

    return () => {
        (globalThis as any).jest = _jest
    }
});