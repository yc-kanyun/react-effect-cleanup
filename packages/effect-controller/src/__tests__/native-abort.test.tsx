import { beforeEach, describe, expect, test, vitest } from "vitest";


describe('对于一个标准 AbortController', () => {
    let controller: AbortController;
    const trace = vitest.fn();

    beforeEach(() => {
        trace.mockClear();
        controller = new AbortController();
    })

    test('addEventListener 在 abort 后的顺序测试', () => {
        const signal = controller.signal;

        signal.addEventListener('abort', () => { trace(1) });
        signal.addEventListener('abort', () => { trace(2) });


        controller.abort();

        expect(trace).toHaveBeenCalledTimes(2);
        expect(trace).toHaveBeenNthCalledWith(1, 1);
        expect(trace).toHaveBeenNthCalledWith(2, 2);
    })

    test('abort 之后再进行 addEventListener 不会触发', () => {
        const signal = controller.signal;

        controller.abort();

        signal.addEventListener('abort', () => { trace(2) });

        expect(trace).toHaveBeenCalledTimes(0);
    })
})
