import 'whatwg-fetch'
import '@testing-library/jest-dom/jest-globals'
import { test, expect, jest, beforeEach, afterEach } from "@jest/globals"
import { render, cleanup, screen } from "@testing-library/react"
import { StrictMode, useEffect, useState } from 'react'
import userEvent from '@testing-library/user-event'

beforeEach(() => {
    jest.useFakeTimers()
    expect(jest.getTimerCount()).toBe(0)
})

afterEach(() => {
    expect(jest.getTimerCount()).toBe(0)
    jest.useRealTimers()
})

/*
 下面这个例子展示了 effect 中没有清理异步任务存在的问题
 在更后面的测试中，我们尝试提出多种解决方案来修复这个问题
 */
test('在 effect 中驱动一个外部异步任务的例子', async () => {
    const traceClockTick: (label: string) => void = jest.fn();
    /**
     * 这里我们用 setInterval 来模拟一个外部驱动的异步任务，实际情况下可能是 websocket 或者其他异步任务。这些任务可能不支持 
     * [AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)，所以我们在这里也不用
     * clearInterval 之类的方法来清理
     * 
     * @param label 
     */
    function beginExternalClock(label: string) {
        setInterval(() => {
            traceClockTick(label)
        }, 1000);
    }

    function Clock() {
        useEffect(() => {
            beginExternalClock('clock')
        }, [])

        return <div>Clock Tick</div>
    }

    /**
     * ClockWrapper 对 Clock 进行了一次包裹，这样我们可以模拟 Clock 在 unmount 后异步任务和回调仍然继续执行的情况
     * 
     * @returns 
     */
    function ClockWrapper() {
        const [showClock, setShowClock] = useState(false)

        return <>
            <button onClick={() => { setShowClock(!showClock) }}>{showClock ? 'Close' : 'Open'}</button>
            {showClock && <Clock />}
        </>
    }

    const user = userEvent.setup({
        delay: null
    })
    // Given: 用户打开 Clock，外部异步任务正常执行中
    {
        render(
            <ClockWrapper />
        )

        await user.click(screen.getByText('Open'))

        expect(screen.getByText("Clock Tick")).toBeInTheDocument()
        expect(traceClockTick).toBeCalledTimes(0)

        jest.runOnlyPendingTimers()

        expect(traceClockTick).toBeCalledWith("clock")
        expect(traceClockTick).toBeCalledTimes(1) // 这里可以看到 interval 在正常执行
    }

    // When: 用户关闭了 Clock
    await user.click(screen.getByText('Close'))

    // Then: Clock 仍然被执行了，因为 effect 中开启的 interval 任务并没有被清理。我们的目的是在用户关闭 Clock 时，停止 Clock 的执行
    jest.runOnlyPendingTimers()
    expect(traceClockTick).toBeCalledTimes(2)
    expect(jest.getTimerCount()).toBe(1) // 可以发现还有一个 timer 存在于系统中

    // 测试结束前清理所有的副作用
    jest.clearAllTimers();
})

/*
第一种修复问题的思路是外部异步任务支持 destroy，由 component 来调用 destroy 来清理
这种方法是 React 中最常见的清理副作用的方法
 */
test('在 effect 中清理外部副作用', async () => {
    const traceClockTick: (label: string) => void = jest.fn();

    /**
     * 这里我们用一个 Class 来执行 clock，和习惯的代码更加接近
     */
    class ExternalClock {
        private timer: ReturnType<typeof setInterval> | null = null;

        constructor(label: string) {
            this.timer = setInterval(() => {
                traceClockTick(label)
            }, 1000);
        }

        destroy(): void {
            if (this.timer) {
                clearInterval(this.timer)
                this.timer = null;
            }

        }
    }

    function Clock() {
        useEffect(() => {
            const clock = new ExternalClock('clock');
            return () => {
                clock.destroy();
            }
        }, [])

        return <div>Clock Tick</div>
    }

    const user = userEvent.setup({
        delay: null
    })

    // Given: 用户打开 Clock，外部异步任务正常执行中
    {
        function ClockWrapper() {
            const [showClock, setShowClock] = useState(false)

            return <>
                <button onClick={() => { setShowClock(!showClock) }}>{showClock ? 'Close' : 'Open'}</button>
                {showClock && <Clock />}
            </>
        }

        render(
            <ClockWrapper />
        )

        await user.click(screen.getByText('Open'))

        expect(screen.getByText("Clock Tick")).toBeInTheDocument()
        expect(traceClockTick).toBeCalledTimes(0)

        jest.runOnlyPendingTimers()

        expect(traceClockTick).toBeCalledWith("clock")
        expect(traceClockTick).toBeCalledTimes(1) // 这里可以看到 interval 在正常执行
    }

    // When: 用户关闭了 Clock
    await user.click(screen.getByText('Close'))

    // Then: Clock 不会继续被执行了
    jest.runOnlyPendingTimers()
    expect(traceClockTick).toBeCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0) // 系统中没有 timer 了
})


/*
正确编写 destroy 方法是很困难的，它很容易写错，尤其是当我们执行的外部状态比较复杂时
 */
test('外部异步任务比较复杂时，destroy 的编写会非常困难且易错', async () => {
    const traceClockTick = jest.fn();

    /**
     * 这里我们用一个 Class 来执行 clock，和习惯的代码更加接近
     */
    class ExternalClock {
        private timer1: ReturnType<typeof setTimeout> | null = null;
        private timer2: ReturnType<typeof setTimeout> | null = null;
        private timer3: ReturnType<typeof setTimeout> | null = null;
        private timer4: ReturnType<typeof setTimeout> | null = null;
        // @ts-expect-error: 这里故意模拟一个错误，timer5 没有被清理
        private timer5: ReturnType<typeof setTimeout> | null = null;

        /**
         * 这里我们通过多个 timer 级联的形式，模拟实际情况中会遇到的异步触发新的异步的情况
         * 
         * @param label 
         */
        constructor(label: string) {
            this.timer1 = setTimeout(() => {
                traceClockTick(label)

                this.timer2 = setTimeout(() => {
                    traceClockTick(label)

                    this.timer3 = setTimeout(() => {
                        traceClockTick(label)

                        this.timer4 = setTimeout(() => {
                            traceClockTick(label)

                            this.timer5 = setTimeout(() => {
                                traceClockTick(label)
                            })
                        })
                    })
                })

            }, 1000);
        }

        /**
         * destroy 中清理副作用的代码，和产生副作用的代码相聚非常远
         * clearTimeout 是幂等的，所以看起来比较简单
         * 但实际情况下，有些清理方法并不能重复执行，需要我们额外存储一些状态来标记副作用是否产生，要清理哪些副作用
         */
        destroy(): void {
            if (this.timer1) {
                clearTimeout(this.timer1)
                this.timer1 = null;
            }

            if (this.timer2) {
                clearTimeout(this.timer2)
                this.timer1 = null;
            }

            if (this.timer3) {
                clearTimeout(this.timer3)
                this.timer1 = null;
            }

            if (this.timer4) {
                clearTimeout(this.timer4)
                this.timer1 = null;
            }

            // 这里我们故意漏掉了 timer5 的清理，来模拟开发中创建的一个情况
            // 开发者在创建副作用的地方增加了一个 timer，但可能想不起来要在 destroy 中清理
        }
    }

    function Clock() {
        useEffect(() => {
            const clock = new ExternalClock('clock');
            return () => {
                clock.destroy();
            }
        }, [])

        return <div>Clock Tick</div>
    }

    const user = userEvent.setup({
        delay: null
    })

    function ClockWrapper() {
        const [showClock, setShowClock] = useState(false)

        return <>
            <button onClick={() => { setShowClock(!showClock) }}>{showClock ? 'Close' : 'Open'}</button>
            {showClock && <Clock />}
        </>
    }

    render(
        <ClockWrapper />
    )

    await user.click(screen.getByText('Open'))
    jest.runOnlyPendingTimers() // 创建 timer2
    jest.runOnlyPendingTimers() // 创建 timer3
    jest.runOnlyPendingTimers() // 创建 timer4
    jest.runOnlyPendingTimers() // 创建 timer5
    await user.click(screen.getByText('Close'))

    // 这里可以看到还有一个 timer 存在于系统中
    // 这个 timer 在实际情况下，有可能没问题，有可能有问题
    expect(jest.getTimerCount()).toBe(1)

    jest.clearAllTimers()
})

type AbortedFn = () => boolean;
type AbortFn = () => void;
type CleanupFn = () => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunc = (...args: any[]) => any;
type AbortSwitchCallback<Func extends AnyFunc> = (
    abortContext: AbortContext,
    ...args: Parameters<Func>
) => ReturnType<Func>;
type AbortSwitchWrapperFn<Func extends AnyFunc> = (cb: AbortSwitchCallback<Func>) => Func

interface AbortContext {
    aborted: AbortedFn,
    onAbort(cleanup: CleanupFn): void,
    race<T>(promise: Promise<T>): Promise<{ value: T, aborted: boolean }>,

    /**
     * 返回一个子 switchContext，当前 abortContext 被 abort 时，也会 abort 子 switchContext
     * 
     * @returns 被 AbortContext 所管理的 switchWrapper
     */
    createAbortSwitchWrapper: <Func extends AnyFunc>(childLabel: string) => AbortSwitchWrapperFn<Func>,

    /**
     * 返回一个子 controller, abortController 被 abort 时，也会 abort 子 controller
     * 
     * @returns 被 AbortContext 所管理的 controller
     */
    createController: (label: string) => AbortController
}

interface AbortController extends AbortContext {
    abort: AbortFn,
}

let controllerCounter = 0
function createAbortedController(label: string): AbortController {
    const currCount = controllerCounter++;
    const controllerId = `${label}-${String(currCount)}`
    console.log('[CREATE], id=', controllerId)
    const cleanupCallbacks: CleanupFn[] = []
    const childControllers: AbortController[] = []
    let aborted = false;

    function createChildController(childLabel: string) {
        console.log('[CREATE CHILD], id=', controllerId)
        const ctrl = createAbortedController(childLabel);
        childControllers.push(ctrl)

        ctrl.onAbort(() => {
            const idx = childControllers.indexOf(ctrl)
            if (idx >= 0) {
                childControllers.splice(idx, 1)
            }
        })

        return ctrl;
    }

    return {
        abort: () => {
            console.log('[ABORT], id=', controllerId)
            if (aborted) {
                console.log('[ABORT] redundant, id=', controllerId)
                return;
            }
            console.log('[ABORT] begin..., id=', controllerId)

            for (let i = childControllers.length - 1; i >= 0; i--) {
                childControllers[i].abort()
            }
            childControllers.length = 0

            cleanupCallbacks.reverse().forEach(cb => { cb() });
            cleanupCallbacks.length = 0
            aborted = true;
            console.log('[ABORT] done, id=', controllerId)
        },

        aborted: () => aborted,

        onAbort: (cleanup: CleanupFn) => {
            cleanupCallbacks.push(cleanup);
        },

        race: async function <T>(promise: Promise<T>) {
            return { value: await promise, aborted }
        },

        createAbortSwitchWrapper: <Func extends AnyFunc>(childLabel: string) => {
            let currCtrl: AbortController | null = null;
            cleanupCallbacks.push(() => {
                if (currCtrl) {
                    currCtrl.abort()
                    currCtrl = null;
                }
            })

            const retFunc: AbortSwitchWrapperFn<Func> = (cb: AbortSwitchCallback<Func>) => {
                return function (...args: Parameters<Func>): ReturnType<Func> {
                    if (currCtrl) {
                        currCtrl.abort();
                    }
                    currCtrl = createChildController(childLabel);

                    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                    return cb(currCtrl, ...args)
                } as Func
            }

            return retFunc;
        },

        createController: (label: string) => {
            return createChildController(label);
        }
    }
}

function useAbort(label: string, abortContext?: AbortContext): AbortContext | null {
    const [currCtx, setCurrCtx] = useState<AbortController | null>(null);

    useEffect(() => {
        const controller = abortContext ? abortContext.createController(label) : createAbortedController(label)
        setCurrCtx(controller);

        return () => {
            controller.abort();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return currCtx;
}

/**
 * 下面这个例子展示如何用 AbortController 来管理副作用的清理，AbortController 可以让创建副作用和清理副作用的地方尽可能地接近，这降低了编写清理方法的难度
 */
test('用 AbortController 来管理副作用的清理，', async () => {
    const traceClockTick = jest.fn();

    function timeout(cb: Parameters<typeof setTimeout>[0], ms: Parameters<typeof setTimeout>[1]): () => void {
        const timer = setTimeout(() => {
            cb()
        }, ms)

        return () => { clearTimeout(timer) }
    }

    function beginExternalClock(abortContext: AbortContext, label: string) {
        abortContext.onAbort(timeout(() => {
            traceClockTick(label)

            abortContext.onAbort(timeout(() => {
                traceClockTick(label)

                abortContext.onAbort(timeout(() => {
                    traceClockTick(label)

                    abortContext.onAbort(timeout(() => {
                        traceClockTick(label)

                        abortContext.onAbort(timeout(() => {
                            traceClockTick(label)
                        }, 1000))
                    }, 1000))
                }, 1000))
            }, 1000))
        }, 1000))
    }

    function Clock() {
        const abort = useAbort('clock');

        useEffect(() => {
            if (!abort) {
                return;
            }

            beginExternalClock(abort, 'clock')
        }, [abort])

        return <div>Clock Tick</div>
    }

    const user = userEvent.setup({
        delay: null
    })

    function ClockWrapper() {
        const [showClock, setShowClock] = useState(false)

        return <>
            <button onClick={() => { setShowClock(!showClock) }}>{showClock ? 'Close' : 'Open'}</button>
            {showClock && <Clock />}
        </>
    }

    render(
        <ClockWrapper />
    )

    await user.click(screen.getByText('Open'))
    jest.runOnlyPendingTimers()
    await user.click(screen.getByText('Close'))

    // 注意下面的代码，成功清理了所有的副作用
    expect(jest.getTimerCount()).toBe(0)
})

/**
 * 如果是父发起的清理任务，那么子的清理一定会被执行
 * 但如果在这之前子已经被清理了，那么父在清理时不应该再重复执行子的清理
 */
test('AbortContext 不应该被重复清理，而且在父清理时，应该先清理所有子，最后清理父', async () => {
    const user = userEvent.setup({
        delay: null
    })

    const traceAbortRun = jest.fn();

    function stubSetup(abortContext: AbortContext) {
        console.log('stub setup')
        abortContext.onAbort(() => {
            traceAbortRun('inner');
        })
    }

    function Node({ abortContext }: { abortContext: AbortContext }) {
        const abort = useAbort('NODE', abortContext);

        useEffect(() => {
            if (!abort) {
                return;
            }

            stubSetup(abort)
        }, [abort])

        return <div>Clock Tick</div>
    }

    function NodeOuter() {
        const abort = useAbort('PARENT');

        useEffect(() => {
            if (!abort) {
                return;
            }

            abort.onAbort(() => {
                traceAbortRun('outer')
            })
        }, [abort])

        if (!abort) {
            return <></>
        }

        return <>
            <Node abortContext={abort} />
        </>
    }

    function Page() {
        const [showNode, setShowNode] = useState(false)

        return <>
            <button onClick={() => { setShowNode(!showNode) }}>{showNode ? 'Close' : 'Open'}</button>
            {showNode && <NodeOuter />}
        </>
    }


    render(
        <Page />
    )

    await user.click(screen.getByText('Open'))
    expect(screen.getByText('Clock Tick')).toBeInTheDocument()

    await user.click(screen.getByText('Close'))

    // 这里 traceAbortRun 应该只被执行一次，子组件先被析构，所以父 context 析构时不应该重复执行子 context 的析构
    expect(traceAbortRun).toBeCalledTimes(2)
    expect(traceAbortRun).toHaveBeenNthCalledWith(1, 'inner')
    expect(traceAbortRun).toHaveBeenNthCalledWith(2, 'outer')
})

/*
这里展示 effect 中清理副作用的另一个问题
effect 显然是 render event 驱动的，这可能会导致一些高开销的方法重复执行
在这个例子中，我们增加 <StrictMode />，会发现我们创建了两个 ExternalClock 实例
 */
test('在 effect 中创建副作用可能因为渲染时间支付高昂的成本', async () => {
    const traceClockInit = jest.fn();
    const traceClockTick = jest.fn();

    /**
     * 这里我们用一个 Class 来执行 clock，和习惯的代码更加接近
     */
    class ExternalClock {
        private timer: ReturnType<typeof setInterval> | null = null;

        constructor(label: string) {
            traceClockInit(label)

            this.timer = setInterval(() => {
                traceClockTick(label)
            }, 1000);
        }

        destroy(): void {
            if (this.timer) {
                clearInterval(this.timer)
                this.timer = null;
            }

        }
    }

    function Clock() {
        useEffect(() => {
            const clock = new ExternalClock('clock');
            return () => {
                clock.destroy();
            }
        }, [])

        return <div>Clock Tick</div>
    }

    const user = userEvent.setup({
        delay: null
    })

    function ClockWrapper() {
        const [showClock, setShowClock] = useState(false)

        return <>
            <button onClick={() => { setShowClock(!showClock) }}>{showClock ? 'Close' : 'Open'}</button>
            {showClock && <Clock />}
        </>
    }

    render(
        <StrictMode>
            <ClockWrapper />
        </StrictMode>
    )

    await user.click(screen.getByText('Open'))

    // 这里可以发现，我们创建了两个 ExternalClock 实例。在这个例子中可能不是个大问题，但实际情况下，创建外部副作用的成本可能是非常高的
    // 比如，创建一个 websocket 连接，或者是发送一次 http 请求
    // React 并没有承诺 render 事件执行次数的确定性，包括执行的顺序，只是在当前版本中它恰好是连续顺序执行一次的，但这个行为也不能保证在未来的版本中不会改变
    expect(traceClockInit).toBeCalledTimes(2)

    await user.click(screen.getByText('Close'))
})

/**
 * 用 AbortController 和 Effect 一起，可以解决副作用的清理问题。但这个写法里有很多的坑，下面的测试介绍了正确的写法，以及哪些地方容易写错
 */
test('用 AbortController + Effect', async () => {
    const LABEL_NODE = 'Node';
    const LABEL_PARENT = 'Parent';
    const traceStubSetup = jest.fn();
    const traceAbortRun = jest.fn();
    /**
     * 模拟的 setup 过程，包括了模拟的清理过程
     * @param abortContext 
     */
    function stubSetup(abortContext: AbortContext) {
        traceStubSetup();
        abortContext.onAbort(() => { traceAbortRun(LABEL_NODE) })
    }

    const traceNodeEffect = jest.fn();
    const traceNodeEffectCleanup = jest.fn()
    const traceEffectCleanup = jest.fn()
    function Node({ abortContext }: { abortContext: AbortContext }) {
        /**
         * 在 Node 里创建一个 abort context，继承自父 context
         */
        const abort = useAbort(LABEL_NODE, abortContext);

        useEffect(() => {
            traceNodeEffect(LABEL_NODE, abort);
            if (!abort) {
                return () => {
                    traceEffectCleanup(LABEL_NODE)
                    traceNodeEffectCleanup(LABEL_NODE, abort)
                }
            }

            stubSetup(abort)
            return () => {
                traceEffectCleanup(LABEL_NODE)
                traceNodeEffectCleanup(LABEL_NODE, abort)
            }
        }, [abort])

        return <div>Clock Tick</div>
    }

    function Parent() {
        const abort = useAbort(LABEL_PARENT);

        useEffect(() => {
            if (!abort) {
                return;
            }

            abort.onAbort(() => { traceAbortRun(LABEL_PARENT) })

            return () => {
                traceEffectCleanup(LABEL_PARENT)
            }
        }, [abort])

        if (!abort) {
            return <></>
        }

        return <>
            <Node abortContext={abort} />
        </>
    }

    render(
        <StrictMode>
            <Parent />
        </StrictMode>
    )

    /**
     * traceNodeEffect 被执行了 3 次，strict 执行了两次，effect deps 的 abort value 发生变化又执行了一次
    */
    expect(traceNodeEffect).toBeCalledTimes(3)
    expect(traceNodeEffect.mock.calls[0][1]).toBeNull()
    expect(traceNodeEffect.mock.calls[1][1]).toBeNull()
    expect(traceNodeEffect.mock.calls[2][1]).not.toBeNull()

    /**
     * 只有第三次 traceNodeEffect 执行时，才会执行 traceStubSetup，因为此时 abort 不为 null
     */
    expect(traceStubSetup).toBeCalledTimes(1)

    /**
     * traceEffectCleanup 执行两次，第一次是 strict mode 在清理第一趟执行，第二次是 abort 变化后，effect deps 数组发生变化，清理上一次 effect
     * 所以这两次的 abort 都是 null
     */
    expect(traceNodeEffectCleanup).toBeCalledTimes(2)
    expect(traceNodeEffectCleanup.mock.calls[0][1]).toBeNull()
    expect(traceNodeEffectCleanup.mock.calls[1][1]).toBeNull()

    /**
     * strict mode 的清理过程中 abort context 都是空的，所以既不会执行有副作用的方法，自然也不会去 abort 任何 cleanup 过程
    */
    expect(traceAbortRun).toBeCalledTimes(0)

    jest.clearAllMocks()
    cleanup()

    /**
     * React 在调用组件的 effect cleanup 时会先执行 parent 的然后才是 child 的，自顶向下
     */
    expect(traceEffectCleanup).toBeCalledTimes(2)
    expect(traceEffectCleanup).nthCalledWith(1, LABEL_PARENT)
    expect(traceEffectCleanup).nthCalledWith(2, LABEL_NODE)

    /**
     * 但是 abort context 的清理过程是自下而上的，所以会先执行 child 的 cleanup，再执行 parent 的 cleanup
     * 下面这两次清理都是在 parent 的 effect cleanup 过程中执行的
     */
    expect(traceAbortRun).toBeCalledTimes(2)
    expect(traceAbortRun).toHaveBeenNthCalledWith(1, LABEL_NODE)
    expect(traceAbortRun).toHaveBeenNthCalledWith(2, LABEL_PARENT)
})
