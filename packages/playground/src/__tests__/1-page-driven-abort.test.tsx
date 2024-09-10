import { test, afterEach, beforeEach, expect, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { StrictMode, useEffect } from 'react'
import { create } from 'zustand'

beforeEach(() => {
    vi.useFakeTimers()
})

afterEach(() => {
    cleanup()
    vi.useRealTimers()
})

/**
 * 让我们先从一个最基本的需求出发，当 SPA 切换页面时，前一个页面的异步任务的回调不应该被继续执行了
 * 这个需求在长生命周期的应用中是非常基本的需求，比如在聊天室页面会建立一个长连接，当返回到聊天列表页时，这个长连接应该被关闭
 * 在开始之前，我们先用一些简单的测试熟悉一下 React 和 Jest 测试
 */
test('简单的 route 测试，用来解释说明基本的测试结构', () => {
    const router = createMemoryRouter([{
        path: '/',
        element: <div>Home</div>,
    }, {
        path: '/foo',
        element: <div>Foo</div>
    }])

    render(<StrictMode>
        <RouterProvider router={router} />
    </StrictMode>)

    act(() => {
        void router.navigate('/foo')
    })

    expect(screen.getByText('Foo')).toBeTruthy()
})

/**
 * 下面这个测试展示了 strict mode 下的 effect 多次执行，这个测试中需要留意 vi.fn() 的用法，后续会大量使用这个 pattern
 */
test('增加 effect，用来验证 strict mode，以及解释说明 mock fn 的基本用法', () => {
    const trace: (label: string) => void = vi.fn();

    function Home() {
        useEffect(() => {
            trace('home')
        }, [])

        return <div>home</div>
    }

    const router = createMemoryRouter([{
        path: '/',
        element: <Home />,
    }])

    render(<StrictMode>
        <RouterProvider router={router} />
    </StrictMode>)

    expect(screen.getByText('home')).toBeTruthy()

    // effect 执行了两次
    expect(trace).toBeCalledTimes(2)
    expect(trace).toHaveBeenNthCalledWith(1, 'home')
    expect(trace).toHaveBeenNthCalledWith(2, 'home')
})

/**
 * 
 */
test('测试 effect 中的异步 mock 方法应该被 strict mode 执行两次', () => {
    const trace: (label: string) => void = vi.fn();

    function Home() {
        useEffect(() => {
            setTimeout(() => {
                trace('home')
            }, 100)
        }, [])

        return <div>home</div>
    }

    const router = createMemoryRouter([{
        path: '/',
        element: <Home />,
    }])

    render(<StrictMode>
        <RouterProvider router={router} />
    </StrictMode>)

    expect(screen.getByText('home')).toBeTruthy()
    vi.runAllTimers()
    expect(trace).toBeCalledTimes(2)
})

/**
 * 热身阶段结束，接下来我们在 effect 中引入一个真实的副作用，这个副作用是一个异步任务
 * 为了模拟这个异步任务，我们用 setTimeout 来模拟一个异步请求
 * Home 组件在渲染后，100ms 后会返回。而 Foo 组件在 10ms 后回返回
 * 我们先从 Home 页开始，然后切换到 Foo 页面，观察最后一次 trace 调用的参数
 */
test('引入 Race Condition，在切换到 foo 页后，trace 的最后一次调用却是 home', () => {
    const trace: (label: string) => void = vi.fn();

    function Home() {
        useEffect(() => {
            setTimeout(() => {
                // 下面这行代码会在切换到 Foo 页面之后，仍然继续执行，尽管此时 Home 组件已经被 unmount 了
                trace('home')
            }, 100);
        }, [])

        return <div>Home</div>
    }

    function Foo() {
        useEffect(() => {
            setTimeout(() => {
                trace('foo')
            }, 10);
        }, [])

        return <div>Foo</div>
    }

    const router = createMemoryRouter([{
        path: '/',
        element: <Home />,
    }, {
        path: '/foo',
        element: <Foo />,
    }])

    render(<StrictMode>
        <RouterProvider router={router} />
    </StrictMode>)

    act(() => {
        void router.navigate('/foo')
    })

    vi.runAllTimers()
    expect(screen.getByText('Foo')).toBeTruthy()

    // 观察下面的断言，尽管页面已经切换到了 Foo 页，但 trace 方法最后的一次调用却是 home
    // 如果这里是一个 setState('home')，那么在切换到 foo 页时仍然会展示 home
    // 即使 component 已经不存在了，但在 component 的 effect 中执行的异步任务仍然在持续工作
    expect(trace).toHaveBeenLastCalledWith('home')
})

/**
 * 要修复这个问题，React 提供了解决方案，即 Effect 的 cleanup 机制
 * 我们可以给 useEffect 返回一个 callback 函数，这个函数会在组件销毁时执行
 */
test('在 effect 中修复 Race Condition', () => {
    const trace: (label: string) => void = vi.fn();

    function Home() {
        useEffect(() => {
            const timer = setTimeout(() => {
                trace('home')
            }, 100);

            // 返回一个清理函数，用来在组件销毁时清理 effect
            return () => {
                clearTimeout(timer)
            }
        }, [])

        return <div>Home</div>
    }

    function Foo() {
        useEffect(() => {
            const timer = setTimeout(() => {
                trace('foo')
            }, 10);

            // 在 Foo 中也需要做同样的事情
            // 这个清理函数很容易被遗漏，或者在多个 effect 中重复书写
            // 同时，并不是每一个异步任务都是可以被 cancel 的。比如 indexedDb 的异步操作，并不能被 cancel
            return () => {
                clearTimeout(timer)
            }
        }, [])

        return <div>Foo</div>
    }

    // 这一部分操作，和上一个测试没有区别
    {
        const router = createMemoryRouter([{
            path: '/',
            element: <Home />,
        }, {
            path: '/foo',
            element: <Foo />,
        }])

        render(<StrictMode>
            <RouterProvider router={router} />
        </StrictMode>)

        act(() => {
            void router.navigate('/foo')
        })

        vi.runAllTimers()
        expect(screen.getByText('Foo')).toBeTruthy()
    }

    // 观察下面的断言，这里可以看到和上一个测试的区别
    // trace 只执行了一次，切换到 foo 页面后，home 的 effect 被 cancel 了
    expect(trace).toHaveBeenCalledTimes(1)

    // 所以 trace 的最后一次执行是 foo，这是我们期望的结果
    expect(trace).toHaveBeenLastCalledWith('foo')
})

/**
 * 尽管这个测试可以通过，但是这个解决方案并不完美，它至少有两个问题
 *  1. 代码重复，每一个 effect 都需要写 cancel 逻辑
 *  2. 并不是所有的异步任务都可以被 cancel 
 * 以及一个更严重的问题，并不是所有的异步操作都是在 effect 中发起的，它的 cleanup 会非常复杂，甚至外部没有 cleanup 它的能力
 */
test('引入外部存储后 Race Condition 变得复杂，如何避免多发出去的请求', () => {
    const trace: (label: string) => void = vi.fn();

    /**
     * 这里用了 zustand，我们可以先不了解 zustand 到底是什么，只把它当成一个全局的 service，提供一个 delayUpdate 的能力
     * 同时这个 service 存在一个全局的状态 name，这个 name 可以像 useState 一样在 react 中直接使用
     * 只需要了解这么多，就可以继续阅读我们的代码了
     */
    const userStore = create<{ name: string, delayUpdate: (newName: string, delay: number) => Promise<void> }>(set => {
        return {
            name: '',

            /**
             * 这里用 timer 来模拟一个 http request，当 delayUpdate 被调用时，发送一个请求给服务器，并根据返回的结果，更新 userStore 的 value
             * 尽管它跑在 zustand 中，但我们只要当成它是 userSevice.delayUpdate() 这样的全局方法即可
             */
            delayUpdate: (newName, delay) => {
                return new Promise<void>(resolve => {
                    // 下面的异步操作，并不存在于 react 的任何机制之中，是一个外部异步任务
                    setTimeout(() => {
                        set({ name: newName })
                        trace(newName)
                        resolve()
                    }, delay)
                })
            }
        }
    })

    function Name() {
        const name = userStore(state => state.name) // zustand 的 hook，引用 userStore 中的 value
        return <div>Current Name: {name}</div>
    }

    function Home() {
        useEffect(() => {
            /**
             * 在 Home 页发起这个请求，100ms 后请求返回，更新 store 中的 name 为 Home
             * 忽略 zustand 的细节，我们可以理解它是 useUserService().delayUpdate(...) 这样的调用
             * 要注意，在这个调用中我们发起了一个异步请求，并且这个方法没有提供给外部 cancel 的能力
             */
            void userStore.getState().delayUpdate('Home', 100)
        }, [])

        return <Name />
    }

    function Foo() {
        useEffect(() => {
            // 在 Foo 页，10ms 后请求返回，更新 store 中的 name 为 Foo
            void userStore.getState().delayUpdate('Foo', 10)
        }, [])

        return <Name />
    }

    // 测试的执行部分
    {
        const router = createMemoryRouter([{
            path: '/',
            element: <Home />,
        }, {
            path: '/foo',
            element: <Foo />,
        }])

        render(<StrictMode>
            <RouterProvider router={router} />
        </StrictMode>)

        act(() => {
            void router.navigate('/foo')
        })

        /**
         * 我们用了 fakeTimer，所以这里手动情况一下所有的时钟
         * 这里必须把 runAllTimers 包裹在 act 中，告诉 testing-library 这里会发生 state 变化
         * 这只是写测试的要求，和代码逻辑无关
         */
        act(() => {
            vi.runAllTimers()
        })
    }

    // 此时页面已经到了 foo 页，但 name 显示为 Home，因为 Home 的异步请求比 Foo 的请求慢 (100ms > 10ms)
    expect(screen.getByText('Current Name: Home')).toBeTruthy()

    // 同时 trace 方法被调用了 4 次，因为每个 effect 都被执行了两次，这也不是我们期望的结果
    expect(trace).toHaveBeenCalledTimes(4)

    // 我们期望 trace 方法应该只被调用一次，同时页面上展示 Foo。下面的测试来介绍如何解决这个问题
})

/**
 * 首先介绍 router 的 loader 方法，这个方法在指定 router 被切换时执行
 * 注意，这个方法和渲染过程无关，所以它不受 strict mode 的影响
 */
test('简单的 route 带 loader 的测试，说明 loader 的作用', async () => {
    const trace: (label: string) => void = vi.fn();

    const router = createMemoryRouter([{
        path: '/',
        element: <div>Page: Home</div>,
        loader: () => {
            trace('home')
            return null;
        }
    }, {
        path: '/foo',
        element: <div>Page: Foo</div>,
        loader: async () => {
            await new Promise(resolve => setTimeout(resolve, 500))
            trace('foo')
            return null
        }
    }])

    render(<StrictMode>
        <RouterProvider router={router} />
    </StrictMode>)

    await act(async () => {
        void router.navigate('/foo')
        await vi.runAllTimersAsync()
    })

    expect(screen.getByText('Page: Foo')).toBeTruthy()

    // 注意下面的调用次数，在 loader 中的异步操作，每个页面只执行了一次。如果同样的异步过程，放在 effect 中，会因为 strict mode 的原因执行两次
    expect(trace).toHaveBeenCalledTimes(2)
    expect(trace).nthCalledWith(1, 'home')
    expect(trace).nthCalledWith(2, 'foo')
})

/**
 * 接下来我们用 loader 来避免 strict mode 导致的双倍请求，和 render event 解耦
 */
test('用 loader 而不是 effect 来发送请求', async () => {
    const trace: (label: string) => void = vi.fn();
    const userStore = create<{ name: string, delayUpdate: (newName: string, delay: number) => Promise<void> }>(set => {
        return {
            name: '',
            delayUpdate: (newName, delay) => {
                return new Promise<void>(resolve => {
                    setTimeout(() => {
                        set({ name: newName })
                        trace(newName)
                        resolve()
                    }, delay)
                })
            }
        }
    })

    function Name() {
        const name = userStore(state => state.name);
        return <div>{name}</div>
    }

    /**
     * 这里我们去掉了原先 Home 和 Page 两个组件，也不需要用 useEffect。而是用 loader 方法来发送请求
     */
    const router = createMemoryRouter([{
        path: '/',
        element: <Name />,
        loader: async () => {
            await userStore.getState().delayUpdate('Home', 100)
            return null;
        }
    }, {
        path: '/foo',
        element: <Name />,
        loader: async () => {
            await userStore.getState().delayUpdate('Foo', 10)
            return null;
        }
    }])

    render(<StrictMode>
        <RouterProvider router={router} />
    </StrictMode>)

    await act(async () => {
        void router.navigate('/foo')
        await vi.runAllTimersAsync()
    })

    // 这里的断言和上一个测试一样，但是这次的 trace 只被调用了一次。这是因为 loader 方法不受 strict mode 的影响
    expect(trace).toHaveBeenCalledTimes(2)

    // 但是，在切换到 Foo 页面之后，state 还是 Home
    expect(screen.getByText('Home')).toBeTruthy()
})

/**
 * 接下来，引入一个状态来表示当前页面是否已经被切换，如果已经切换，则不再执行异步操作
 */
test('引入 abort 标记，在页面切换时阻止前一个页面的异步回调继续执行', async () => {
    const trace: (label: string) => void = vi.fn();

    type AbortedFn = () => boolean;
    type AbortFn = () => void;

    /**
     * AbortController 是一个简单的标记，用来表示异步操作是否应该被取消
     */
    interface AbortController {
        abort: AbortFn,
        aborted: AbortedFn
    }

    function createAbortedController(): AbortController {
        let aborted = false;

        return {
            abort: () => {
                aborted = true;
            }, aborted: () => aborted
        }
    }

    const userStore = create<{ name: string, delayUpdate: (aborted: AbortedFn, newName: string, delay: number) => Promise<void> }>(set => {
        return {
            name: '',
            delayUpdate: (aborted, newName, delay) => {
                return new Promise<void>(resolve => {
                    setTimeout(() => {
                        // 下面这行代码让任意的异步回调有了被取消的能力
                        if (aborted()) {
                            return;
                        }

                        set({ name: newName })
                        trace(newName)
                        resolve()
                    }, delay)
                })
            }
        }
    })

    function Name() {
        const name = userStore(state => state.name);
        return <div>{name}</div>
    }

    // 需要一个和 router 同级的 singleton 来存储当前页面的 abort 标记
    let abort: AbortFn | null;
    const router = createMemoryRouter([{
        path: '/',
        element: <Name />,
        loader: async () => {
            if (abort) {
                abort()
            }
            const abortedFlag = createAbortedController()
            abort = abortedFlag.abort;

            await userStore.getState().delayUpdate(abortedFlag.aborted, 'Home', 100)
            return null;
        }
    }, {
        path: '/foo',
        element: <Name />,
        loader: async () => {
            if (abort) {
                abort()
            }
            const abortedFlag = createAbortedController()
            abort = abortedFlag.abort;

            await userStore.getState().delayUpdate(abortedFlag.aborted, 'Foo', 10)
            return null;
        }
    }])

    render(<StrictMode>
        <RouterProvider router={router} />
    </StrictMode>)

    await act(async () => {
        void router.navigate('/foo');
        await vi.runAllTimersAsync()
    })

    // 可以看到事情有了变化，页面上展示的是 Foo，而不是 Home，这是我们所期望的
    expect(screen.getByText('Foo')).toBeTruthy()

    // trace 方法的执行次数也正常了，只执行了一次
    expect(trace).toHaveBeenCalledTimes(1)
})

/**
 * 简单整理一下我们刚刚完成的 AbortController 机制
 * 刚才机制虽然可行，但是在 router loader 里有一些样板代码，可以被精简掉
 * 思路是，各个 page 其实是处于一个互斥的 context 中，当一个 page 渲染时，前一个 page 的 AbortController 应该被 abort
 * 所以我们创建一个 AbortContext，这个 context 中会自动 abort 旧的 abortController
 */
test('重构 router 中的重复代码', async () => {
    type AbortedFn = () => boolean;
    type AbortFn = () => void;
    interface AbortController {
        abort: AbortFn,
        aborted: AbortedFn
    }

    function createAbortedController(): AbortController {
        let aborted = false;

        return {
            abort: () => {
                aborted = true;
            }, aborted: () => aborted
        }
    }

    const userStore = create<{ name: string, delayUpdate: (aborted: AbortedFn, newName: string, delay: number) => Promise<void> }>(set => {
        return {
            name: '',
            delayUpdate: (aborted, newName, delay) => {
                return new Promise<void>(resolve => {
                    setTimeout(() => {
                        if (aborted()) {
                            return;
                        }

                        set({ name: newName })
                        resolve()
                    }, delay)
                })
            }
        }
    })

    function Name() {
        const name = userStore(state => state.name);
        return <div>{name}</div>
    }

    /*
    这里我们把 loader 中的重复代码提取出来，创造了一个 abortContext
    这个 context 中有一个 abort controller 单例
    并在新的 loader 函数执行时，取消之前的 abort controller
    这就是之前我们在 loader 中做的事情
     */
    function createAbortContext<T>() {
        let currCtrl: AbortController | null = null;

        /**
         * 返回一个新的高阶函数，这个函数可以对其他函数进行包裹，被包裹的函数执行时，会创建一个新的 abortController，同时 abort 前一个旧的 controller
         */
        return (cb: (aborted: AbortedFn) => Promise<T>) => {
            return async function () {
                if (currCtrl) {
                    currCtrl.abort();
                }

                currCtrl = createAbortedController();
                return await cb(currCtrl.aborted);
            }
        }
    }

    const abortContext = createAbortContext();
    const router = createMemoryRouter([{
        path: '/',
        element: <Name />,
        // 这里让 loader 函数被 abortContext 所包裹
        loader: abortContext(async aborted => {
            await userStore.getState().delayUpdate(aborted, 'Home', 100)
            return null
        })
    }, {
        path: '/foo',
        element: <Name />,
        loader: abortContext(async aborted => {
            await userStore.getState().delayUpdate(aborted, 'Foo', 10)
            return null;
        })
    }])

    // 其余代码和上一个测试一样
    {
        render(<StrictMode>
            <RouterProvider router={router} />
        </StrictMode>)

        await act(async () => {
            void router.navigate('/foo');
            await vi.runAllTimersAsync()
        })


        expect(screen.getByText('Foo')).toBeTruthy()
    }
})

/*
 目前为止我们已经基本上解决了 effect 中异步的清理问题
 1. 通过 loader 方法，避免了 strict mode 导致的双倍请求
 2. 通过 abort 标记，避免异步任务在 component 清理后仍然执行
 3. 通过 abort 标记，让外部执行的异步任务也有了被管理的能力

 但在有些情况下，仅仅阻止异步任务的执行是不够的。业务逻辑还需要我们能清理一些副作用。在 react 中，我们可以通过 useEffect 的返回值来实现这个功能，但对于外部异步任务，我们并没有这个能力。这个测试展示了这种情况
 */
test('考虑清理场景，在 loader fn 中用 subscribe 会引入副作用', async () => {
    type AbortedFn = () => boolean;
    type AbortFn = () => void;
    interface AbortController {
        abort: AbortFn,
        aborted: AbortedFn
    }

    function createAbortedController(): AbortController {
        let aborted = false;

        return {
            abort: () => {
                aborted = true;
            }, aborted: () => aborted
        }
    }

    const userStore = create<{ name: string, delayUpdate: (aborted: AbortedFn, newName: string, delay: number) => Promise<void> }>(set => {
        return {
            name: '',
            delayUpdate: (aborted, newName, delay) => {
                return new Promise<void>(resolve => {
                    setTimeout(() => {
                        if (aborted()) {
                            return;
                        }

                        set({ name: newName })
                        resolve()
                    }, delay)
                })
            }
        }
    })

    function Name() {
        const name = userStore(state => state.name);
        return <div>{name}</div>
    }

    function createAbortContext<T>() {
        let currCtrl: AbortController | null = null;

        return (cb: (aborted: AbortedFn) => Promise<T>) => {
            return async function () {
                if (currCtrl) {
                    currCtrl.abort();
                }

                currCtrl = createAbortedController();
                return await cb(currCtrl.aborted);
            }
        }
    }

    const abortContext = createAbortContext();

    const trace: (label: string) => void = vi.fn();
    const router = createMemoryRouter([{
        path: '/',
        element: <Name />,
        loader: abortContext(async aborted => {
            // 下面这一行引入了副作用。loader 并不存在于 react 生命周期内，无法通过 useEffect 的回调函数来清理
            userStore.subscribe(state => { trace(state.name) })
            await userStore.getState().delayUpdate(aborted, 'Home', 100)
            return null;
        })
    }, {
        path: '/foo',
        element: <Name />,
        loader: abortContext(async aborted => {
            await userStore.getState().delayUpdate(aborted, 'Foo', 10)
            return null;
        })
    }])

    // 其余代码和上一个测试一样
    {
        render(<StrictMode>
            <RouterProvider router={router} />
        </StrictMode>)

        await act(async () => {
            void router.navigate('/foo');
            await vi.runAllTimersAsync()
        })

        expect(screen.getByText('Foo')).toBeTruthy()
    }

    // 注意这行代码，trace 被调用了一次，这并不是我们期望的结果
    // 在用户离开 home 页面之后，home loader 中的副作用应该被清理，subscribe 应该被解除，所以 trace 的回调也不应该被执行
    // 但离开了 useEffect，我们就没有办法清理这个副作用了。所以在进入 foo 页面后，home loader 中的 subscribe 回调被执行了
    expect(trace).toHaveBeenCalledTimes(1)
})

test('给 AbortController 引入 cleanup 机制', async () => {
    type AbortedFn = () => boolean;
    type AbortFn = () => void;
    type CleanupFn = () => void;
    interface AbortContext {
        aborted: AbortedFn,
        onAbort(cleanup: CleanupFn): void,
    }
    interface AbortController extends AbortContext {
        abort: AbortFn,
    }

    function createAbortedController(): AbortController {
        const cleanupCallbacks: CleanupFn[] = []
        let aborted = false;

        return {
            abort: () => {
                cleanupCallbacks.forEach(cb => { cb() });
                aborted = true;
            },
            aborted: () => aborted,
            onAbort: (cleanup: CleanupFn) => {
                cleanupCallbacks.push(cleanup);
            }
        }
    }

    const userStore = create<{ name: string, delayUpdate: (abortedCtx: AbortContext, newName: string, delay: number) => Promise<void> }>(set => {
        return {
            name: '',
            delayUpdate: (abortedCtx, newName, delay) => {
                return new Promise<void>(resolve => {
                    setTimeout(() => {
                        if (abortedCtx.aborted()) {
                            return;
                        }

                        set({ name: newName })
                        resolve()
                    }, delay)
                })
            }
        }
    })

    function Name() {
        const name = userStore(state => state.name);
        return <div>{name}</div>
    }

    function createAbortContext<T>() {
        let currCtrl: AbortController | null = null;

        return (cb: (abortContext: AbortContext) => Promise<T>) => {
            return async function () {
                if (currCtrl) {
                    currCtrl.abort();
                }

                currCtrl = createAbortedController();
                return await cb(currCtrl);
            }
        }
    }

    const abortContext = createAbortContext();

    const trace: (label: string) => void = vi.fn();
    const router = createMemoryRouter([{
        path: '/',
        element: <Name />,
        loader: abortContext(async abortCtx => {
            const unsubscribe = userStore.subscribe(state => { trace(state.name) })
            // 这一行通过 AbortController 的 onAbort 方法实现了副作用的清理能力
            abortCtx.onAbort(unsubscribe)

            await userStore.getState().delayUpdate(abortCtx, 'Home', 100)
            return null;
        })
    }, {
        path: '/foo',
        element: <Name />,
        loader: abortContext(async abortCtx => {
            await userStore.getState().delayUpdate(abortCtx, 'Foo', 10)
            return null;
        })
    }])

    // 其余代码和上一个测试一样
    {
        render(<StrictMode>
            <RouterProvider router={router} />
        </StrictMode>)

        await act(async () => {
            void router.navigate('/foo');
            await vi.runAllTimersAsync()
        })

        expect(screen.getByText('Foo')).toBeTruthy()
    }

    // 这样，在切换到 Foo 页面之后，Home 页中的 subscribe 回调就不会被执行了
    expect(trace).toHaveBeenCalledTimes(0)
})

/**
 * 在进入下一个测试前，我们需要再重复一下两个概念:
 * 1. Abort，Abort 是阻止不期望的代码继续执行的能力
 * 2. Cleanup，Cleanup 是消除已经产生的副作用的能力
 * 
 * 这两个概念有些类似，因为标记 abort 和进行 cleanup 往往是同时产生的。但它们的职责却完全不同
 * 
 * 至此，我们有了阻止旧页面的回调继续执行，以及副作用清理的能力
 * 
 * 但很多情况下，光阻止页面级别的回调继续执行是不够的。比如我们在页面中打开一个分享弹窗再关闭它，这时并没有 router 事件发生，我们应该如何阻止被关闭的分享弹窗发起的异步请求回调呢？
 */