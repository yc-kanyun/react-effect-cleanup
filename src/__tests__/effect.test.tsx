import { afterEach, beforeEach, describe, expect, test, vitest } from "vitest";
import { EffectController, createAbortedController, EffectTransaction } from "../effect";
import { delay } from "msw";
import { createAbortSwitchWrapper } from "../effect-util";

describe('EffectController 核心行为', () => {
    let ctrl: EffectController;
    beforeEach(() => {
        ctrl = createAbortedController();
    })

    afterEach(() => {
        ctrl.abort()
    })

    test('abort 时应该执行 cleanup 方法', () => {
        const trace = vitest.fn()
        ctrl.onAbort(trace)

        ctrl.abort()

        expect(trace).toHaveBeenCalled()
    })

    test('后注册的 callback 应该先执行', () => {
        const trace = vitest.fn()

        ctrl.onAbort(() => { trace(1) })
        ctrl.onAbort(() => { trace(2) })

        ctrl.abort()

        expect(trace).toHaveBeenCalledTimes(2)
        expect(trace).nthCalledWith(1, 2)
        expect(trace).nthCalledWith(2, 1)
    })

    test('子 context 的 cleanup 应该在父 context 的 cleanup 之前执行', () => {
        const trace = vitest.fn()

        const childCtrl = ctrl.createController()
        childCtrl.onAbort(() => { trace('child') })
        ctrl.onAbort(() => { trace('parent') })

        ctrl.abort()

        expect(trace).toHaveBeenCalledTimes(2)
        expect(trace).nthCalledWith(1, 'child')
        expect(trace).nthCalledWith(2, 'parent')
    })

    test('重复 abort 应该无效', () => {
        const trace = vitest.fn()

        ctrl.onAbort(trace)

        ctrl.abort()
        ctrl.abort()

        expect(trace).toHaveBeenCalledTimes(1)
    })

    test('子 context 单独 abort 一次，再  abort 父 context，子 context 应该不执行 abort', () => {
        const trace = vitest.fn()

        const childCtrl = ctrl.createController()
        childCtrl.onAbort(trace)
        childCtrl.abort()

        vitest.resetAllMocks()
        ctrl.abort()

        expect(trace).not.toBeCalled()
    })

    test('父 context abort 之后，子 context 的 abort 应该不执行', () => {
        const trace = vitest.fn()

        const childCtrl = ctrl.createController()
        childCtrl.onAbort(trace)

        ctrl.abort()

        vitest.resetAllMocks()
        childCtrl.abort()

        expect(trace).not.toBeCalled()
    })

    test('可以通过 onAbort 返回的函数来取消 abort', () => {
        const trace = vitest.fn()

        const removeAbortCb = ctrl.onAbort(trace)
        removeAbortCb()

        ctrl.abort()

        expect(trace).not.toBeCalled()
    })

    test('effectContext 中的 aborted 状态应该随着 abort 方法的调用被修改', () => {
        expect(ctrl.aborted()).toBe(false)

        ctrl.abort()

        expect(ctrl.aborted()).toBe(true)
    })

    test('父 context abort 后 子 context 应该也继承父 context 的 aborted 状态', () => {
        const childCtrl = ctrl.createController()

        expect(childCtrl.aborted()).toBe(false)

        ctrl.abort()

        expect(childCtrl.aborted()).toBe(true)
    })

    test('子 context abort 后，父 context 的 aborted 状态应该没有变化', () => {
        const childCtrl = ctrl.createController()

        expect(childCtrl.aborted()).toBe(false)

        childCtrl.abort()

        expect(childCtrl.aborted()).toBe(true)
        expect(ctrl.aborted()).toBe(false)
    })

    test('已经 abort 的 controller 不应该能创建 child controller', () => {
        ctrl.abort()

        expect(() => ctrl.createController()).toThrow('abort')
    })
})

describe('测试 EffectTransaction', () => {
    let ctrl: EffectController;
    beforeEach(() => {
        ctrl = createAbortedController();
    })

    afterEach(() => {
        ctrl.abort()
    })

    test('用 action 来同时创建副作用和取消副作用', async () => {
        const transaction = new EffectTransaction(ctrl)
        let count = 0;
        await transaction.actAsync(async () => {
            await delay(10).then(() => {
                count += 1;
            })
        }, () => {
            count -= 1;
        })

        expect(count).toBe(1)

        ctrl.abort()

        expect(count).toBe(0)
    })

    test('连续创建 action 会自动处理 aborted，在 abort 之后创建的 action 不会直接，会直接返回', async () => {
        const trace = vitest.fn()

        async function action() {
            const transaction = new EffectTransaction(ctrl)

            await transaction.actAsync(async () => {
                await delay(100);
                trace('firstAction')
            })

            await transaction.actAsync(async () => {
                await delay(100);
                trace('secondAction')
            })
        }

        const ret$ = action()
        await delay(50)
        ctrl.abort()
        await ret$

        expect(trace).toHaveBeenCalledTimes(1)
        expect(trace).nthCalledWith(1, 'firstAction')
        expect(trace).not.nthCalledWith(2, 'secondAction')
    })

    test('action 中创建的资源，cleanup 应该有办法拿到', () => {
        vitest.useFakeTimers()
        const trace = vitest.fn()

        const txn = new EffectTransaction(ctrl)
        txn.act(() => {
            const timer = setTimeout(() => {
                trace('action')
            }, 100)

            return timer;
        }, (timer) => {
            clearTimeout(timer)
        })

        ctrl.abort()
        vitest.runAllTimers()

        expect(trace).not.toBeCalled()
        vitest.useRealTimers()
    })
})

describe('测试 SwitchContext', () => {
    let ctrl: EffectController;
    beforeEach(() => {
        ctrl = createAbortedController();
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