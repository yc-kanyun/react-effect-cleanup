import { test, expect, jest, beforeEach, afterEach } from "@jest/globals"

async function sleep(time: number) {
    return new Promise(r => setTimeout(r, time))
}

beforeEach(() => {
    jest.useFakeTimers()
    expect(jest.getTimerCount()).toBe(0)
})

afterEach(() => {
    expect(jest.getTimerCount()).toBe(0)
    jest.useRealTimers()
})

test('jest timer', async () => {
    expect(jest.getTimerCount()).toBe(0)

    const trace = jest.fn();
    void sleep(100).then(trace)

    await jest.runAllTimersAsync() // 这里不能用 jest.runAllTimers()，后者不会等待 promise.then / await 代码的执行
    expect(jest.getTimerCount()).toBe(0)
    expect(trace).toHaveBeenCalled()
})