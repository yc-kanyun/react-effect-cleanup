import { beforeEach, describe, expect, test, vitest } from "vitest";
import { AbortController, createAbortedController } from "../abort";

describe('abort 的行为', () => {
    let ctrl: AbortController;
    beforeEach(() => {
        ctrl = createAbortedController();
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
})