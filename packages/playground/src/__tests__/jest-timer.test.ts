import { test, afterEach, beforeEach, expect, vi } from "vitest"

async function sleep(time: number) {
    return new Promise(r => setTimeout(r, time))
}

beforeEach(() => {
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
})

test('jest timer', async () => {
    expect(vi.getTimerCount()).toBe(0)

    const trace = vi.fn();
    void sleep(100).then(trace)

    await vi.runAllTimersAsync() // 这里不能用 vi.runAllTimers()，后者不会等待 promise.then / await 代码的执行
    expect(vi.getTimerCount()).toBe(0)
    expect(trace).toHaveBeenCalled()
})