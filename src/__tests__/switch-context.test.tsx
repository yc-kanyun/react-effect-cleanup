import { afterEach, beforeEach, describe, expect, test, vitest } from "vitest";
import { EffectController } from "../effect";
import { createAbortSwitchWrapper } from "./effect-util";

describe('测试 SwitchContext', () => {
    let ctrl: EffectController;
    beforeEach(() => {
        ctrl = new EffectController();
    })

    afterEach(() => {
        ctrl.abort()
    })

    test('用 switchContext 创建的 wrapper，内部函数执行时应该自动 abort 上一个 controller', () => {
        const trace = vitest.fn()

        const wrapper = createAbortSwitchWrapper(ctrl, { debugLabel: 'wrapper' })
        const fn = wrapper((ctx) => {
            ctx.onAbort(() => {
                trace('inner')
            })
        })

        expect(trace).not.toBeCalled()

        fn()
        expect(trace).not.toBeCalled()

        fn()
        expect(trace).toBeCalled()

        fn()
        expect(trace).toBeCalledTimes(2)

        ctrl.abort()
        expect(trace).toBeCalledTimes(3)
    })
})