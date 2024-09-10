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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const _jest = (globalThis as any).jest;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    (globalThis as any).jest = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        ...(globalThis as any).jest,
        advanceTimersByTime: vi.advanceTimersByTime.bind(vi)
    };

    return () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
        (globalThis as any).jest = _jest
    }
});