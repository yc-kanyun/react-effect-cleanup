import { test, afterEach, beforeEach, expect, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom'
import { StrictMode } from 'react'
import { create } from 'zustand'
import userEvent from '@testing-library/user-event'

async function sleep(time: number) {
    return new Promise(r => setTimeout(r, time))
}

async function actTimers() {
    await act(async () => {
        await vi.runAllTimersAsync()
    })
}

beforeEach(() => {
    vi.useFakeTimers()
})

afterEach(() => {
    cleanup()
    vi.useRealTimers()
})

/**
 * 在这个例子中，当用户点击 connect / disconnect 按钮时，会在 connect/disconnect 方法中切换执行
 * 进行 connect 会在 100ms 后设置连接状态是 conntected，所以如果用户连续点击 connect / disconnect 按钮，那么状态的设置顺序是
 * 
 *         v-- connect()   v--- disconnect()
 *   Idle ---> Connecting ---> Idle ------- 100ms --------> Connected
 *              
 * 这不是我们期望的，我们希望在调用 disconnect() 之后，能 abort 最后一次 connected 状态的设置
 * 在下面的测试中，我们首先展示问题是如何出现的。首先从 setupRoomPage 开始
 */
test.skip('同一个页面内异步任务得不到清理的例子', async () => {
    type AbortedFn = () => boolean;
    type AbortFn = () => void;
    type CleanupFn = () => void;
    interface AbortContext {
        aborted: AbortedFn,
        onAbort(cleanup: CleanupFn): void,
        race<T>(promise: Promise<T>): Promise<{ value: T, aborted: boolean }>
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
            },

            /**
             * race 是一个一个 helper util，它将如下代码用更直观的方式表达
             * ```
             *   const ret = await somePromise;
             *   if (abort.aborted()) {
             *       return;
             *   }
             * ```
             * 改成写
             * ```
             *   const { value, aborted } = await abort.race(somePromise)
             *   if (aborted) {
             *       return;
             *   }
             * ```
             */
            race: async function <T>(promise: Promise<T>) {
                return { value: await promise, aborted }
            }
        }
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

    enum RoomStatus {
        Idle,
        Connecting,
        Connected
    }

    interface RoomStore {
        status: RoomStatus,
        connect: (abortedCtx: AbortContext, delay: number) => Promise<void>
        disconnect: () => void
    }

    /**
     * 这里用了 zustand，但实际上我们就当它是一个全局单例 service，拥有 connect 和 disconnect 两个方法，并且有一个全局状态 status 来表示房间状态
     * connect 会立即把状态改成 Connecting，然后在 delay ms 之后将状态改为 Connected
     * disconnect 会立即把状态改成 Idle
     * 初始状态是 Idle
     */
    function createRoomStore() {
        return create<RoomStore>(set => {
            return {
                status: RoomStatus.Idle,

                connect: async (abortedCtx, delay) => {
                    set({ status: RoomStatus.Connecting })

                    const { aborted } = await abortedCtx.race(sleep(delay))
                    if (aborted) {
                        return;
                    }

                    set({ status: RoomStatus.Connected })
                },

                disconnect: () => {
                    set({ status: RoomStatus.Idle })
                }
            }
        });
    }

    interface ViewStore {
        showRoom: boolean,
        toggleRoom: () => void,
    }

    function createViewStore() {
        return create<ViewStore>((set, get) => {
            return {
                showRoom: false,
                toggleRoom: () => {
                    set({ showRoom: !get().showRoom })
                }
            }
        })
    }

    const viewStore = createViewStore()
    const roomStore = createRoomStore()

    function Room() {
        const roomStatus = roomStore(state => state.status);
        return <div>RoomStatus: {RoomStatus[roomStatus]}</div>
    }

    function RoomPage() {
        const toggleRoom = viewStore(state => state.toggleRoom);
        const isIdle = roomStore(state => state.status) === RoomStatus.Idle;
        return <>
            <Room />
            <div><button onClick={toggleRoom}>{isIdle ? 'connect' : 'disconnect'}</button></div>
        </>
    }

    /**
     * setupRoomPage 方法被 router loader 加载，在这个方法中，我们订阅了 viewState 的变化，来控制调用 connect / disconnect
     * 这里我们跳过了用 useEffect 来 watch 变化的步骤，直接在 react 外部发送这个请求
     * 后面的测试中，我们会解释为什么 useEffect 做这件事情会有很多坑
     */
    function setupRoomPage(abortContext: AbortContext): Promise<null> {
        abortContext.onAbort(viewStore.subscribe(state => {
            // 如果 showRoom 则建立连接，否则断开连接
            if (state.showRoom) {
                // 建立连接会理解设置状态为 Connecting，然后在 100ms 后设置状态为 Connected
                void roomStore.getState().connect(abortContext, 100)
                return;
            }

            // 断开连接会立即设置状态为 Idle
            roomStore.getState().disconnect()
        }))

        return Promise.resolve(null);
    }

    // Given: 初始页面
    {
        const abortContext = createAbortContext();
        const router = createMemoryRouter([{
            path: '/',
            element: <RoomPage />,
            loader: abortContext(setupRoomPage)
        }])


        render(<StrictMode>
            <RouterProvider router={router} />
        </StrictMode>)

        await actTimers()
    }

    const user = userEvent.setup({
        delay: null,
    });

    // When: 连续两次点击 toggleRoom 按钮
    {
        expect(screen.getByText('RoomStatus: Idle')).toBeTruthy()

        // When: 点击 toggleRoom 按钮打开房间，开始进行连接
        await user.click(screen.getByText('connect'))

        // Then: 房间状态变成连接中 / Connecting
        expect(screen.getByText('RoomStatus: Connecting')).toBeTruthy()

        // When: 在 Connecting 状态下，点击按钮关闭 Room
        await user.click(screen.getByText('disconnect'))

        // Then: 此时房间状态应该是 Idle
        expect(screen.getByText('RoomStatus: Idle')).toBeTruthy()
    }

    await actTimers()
    // Then: 可以发现 toggleRoom 后，前一个 timer 仍然执行了导致状态变为已连接
    expect(screen.getByText('RoomStatus: Connected')).toBeTruthy()
})

test.skip('泛化 abortContext，解决 state 驱动的异步取消问题', async () => {
    /*
    ---------------- Abort 的工具类，增加了 SwitchWrapper 相关的方法 ----------------
    */
    type AbortedFn = () => boolean;
    type AbortFn = () => void;
    type CleanupFn = () => void;

    /**
     * AbortSwitchWrapperFn 创造了一个 scope，这个 wrapper 会给被包裹的函数传递一个 abortContext，被 wrapper 包裹的 callback 在执行时，会 abort 之前的 AbortContext
     * 因为是互斥关系，所以命名成 SwitchWrapper，参考了 rxjs 中的 switchMap
     */
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
         * 这个思路来自于上一个测试中，page 级别的 switch context 能力。我们把它泛化成一个通用能力
         * 
         * @returns 被 AbortContext 所管理的 switchWrapper
         */
        createAbortSwitchWrapper: <Func extends AnyFunc>() => AbortSwitchWrapperFn<Func>,
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
            },

            race: async function <T>(promise: Promise<T>) {
                return { value: await promise, aborted }
            },

            createAbortSwitchWrapper: <Func extends AnyFunc>() => {
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
                        currCtrl = createAbortedController();

                        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                        return cb(currCtrl, ...args)
                    } as Func
                }

                return retFunc;
            }
        }
    }

    /*
    ---------------- store 定义部分，和上一个测试没有区别 ----------------
    */
    enum RoomStatus {
        Idle,
        Connecting,
        Connected
    }

    interface RoomStore {
        status: RoomStatus,
        connect: (abortedCtx: AbortContext, delay: number) => Promise<void>
        disconnect: () => void
    }

    function createRoomStore() {
        return create<RoomStore>(set => {
            return {
                status: RoomStatus.Idle,

                connect: async (abortedCtx, delay) => {
                    set({ status: RoomStatus.Connecting })

                    const { aborted } = await abortedCtx.race(sleep(delay))
                    if (aborted) {
                        return;
                    }

                    set({ status: RoomStatus.Connected })
                },

                disconnect: () => {
                    set({ status: RoomStatus.Idle })
                }
            }
        });
    }

    interface ViewStore {
        showRoom: boolean,
        toggleRoom: () => void,
    }

    function createViewStore() {
        return create<ViewStore>((set, get) => {
            return {
                showRoom: false,
                toggleRoom: () => {
                    set({ showRoom: !get().showRoom })
                }
            }
        })
    }

    const viewStore = createViewStore()
    const roomStore = createRoomStore()

    /*
    ---------------- setupRoomPage 有一些调整，在 view 变化时 abort 之前的异步操作 ----------------
    */
    function setupRoomPage(abortContext: AbortContext): Promise<null> {
        // viewState 发生变化的回调函数        
        const onViewChange = (abortCtx: AbortContext, state: ViewStore) => {
            if (state.showRoom) {
                void roomStore.getState().connect(abortCtx, 100)
                return Promise.resolve();
            }

            roomStore.getState().disconnect()
            return Promise.resolve()
        }

        // 创建一个 switchContext，switchContext 中的回调函数执行时，会自动创建一个新的 abortContext，并 abort 之前的 context
        const showRoomSwitchWrapper = abortContext.createAbortSwitchWrapper();
        abortContext.onAbort(viewStore.subscribe(showRoomSwitchWrapper(onViewChange)))

        return Promise.resolve(null);
    }

    // 页面级别存在一个 root switchWrapper，它包裹的是各个 page
    const rootSwitchWrapper = createAbortedController().createAbortSwitchWrapper();

    // 这部分和上一个测试没有区别
    {
        function Room() {
            const roomStatus = roomStore(state => state.status);
            return <div>RoomStatus: {RoomStatus[roomStatus]}</div>
        }

        function RoomPage() {
            const toggleRoom = viewStore(state => state.toggleRoom);
            const isIdle = roomStore(state => state.status) === RoomStatus.Idle;
            return <>
                <Room />
                <div><button onClick={toggleRoom}>{isIdle ? 'connect' : 'disconnect'}</button></div>
            </>
        }

        const router = createMemoryRouter([{
            path: '/',
            element: <RoomPage />,
            loader: rootSwitchWrapper(setupRoomPage)
        }])

        const user = userEvent.setup({
            delay: null,
        })

        render(<StrictMode>
            <RouterProvider router={router} />
        </StrictMode>)

        await actTimers();
        expect(screen.getByText('RoomStatus: Idle')).toBeTruthy()

        await user.click(screen.getByText('connect'))
        expect(screen.getByText('RoomStatus: Connecting')).toBeTruthy()

        await user.click(screen.getByText('disconnect'))
        expect(screen.getByText('RoomStatus: Idle')).toBeTruthy()
    }


    // When: 清空 timer 队列
    // 下面的断言和上一个测试有区别，这是我们期望的结果
    // Then: 房间状态是 Idle，因为 Connecting 的回调被取消了
    await actTimers()
    expect(screen.getByText('RoomStatus: Idle')).toBeTruthy()
})

test.skip('验证在页面切换时，异步任务也可以得到清理', async () => {
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
        createAbortSwitchWrapper: <Func extends AnyFunc>() => AbortSwitchWrapperFn<Func>,
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
            },

            race: async function <T>(promise: Promise<T>) {
                return { value: await promise, aborted }
            },

            createAbortSwitchWrapper: <Func extends AnyFunc>() => {
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
                        currCtrl = createAbortedController();

                        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                        return cb(currCtrl, ...args)
                    } as Func
                }

                return retFunc;
            }
        }
    }
    enum RoomStatus {
        Idle,
        Connecting,
        Connected
    }

    interface RoomStore {
        status: RoomStatus,
        connect: (abortedCtx: AbortContext, delay: number) => Promise<void>
        disconnect: () => void
    }

    function createRoomStore() {
        return create<RoomStore>(set => {
            return {
                status: RoomStatus.Idle,

                connect: async (abortedCtx, delay) => {
                    set({ status: RoomStatus.Connecting })
                    abortedCtx.onAbort(() => {
                        set({ status: RoomStatus.Idle })
                    })

                    const { aborted } = await abortedCtx.race(sleep(delay))
                    if (aborted) {
                        return;
                    }

                    set({ status: RoomStatus.Connected })
                },

                disconnect: () => {
                    set({ status: RoomStatus.Idle })
                }
            }
        });
    }

    interface ViewStore {
        showRoom: boolean,
        toggleRoom: () => void,
    }

    function createViewStore() {
        return create<ViewStore>((set, get) => {
            return {
                showRoom: false,
                toggleRoom: () => {
                    set({ showRoom: !get().showRoom })
                }
            }
        })
    }

    const viewStore = createViewStore()
    const roomStore = createRoomStore()

    function setupRoomPage(abortContext: AbortContext): Promise<null> {
        const onViewChange = (abortCtx: AbortContext, state: ViewStore): Promise<void> => {
            if (state.showRoom) {
                void roomStore.getState().connect(abortCtx, 100)
                return Promise.resolve();
            }

            roomStore.getState().disconnect()
            return Promise.resolve();
        }

        const showRoomSwitchWrapper = abortContext.createAbortSwitchWrapper();
        abortContext.onAbort(viewStore.subscribe(showRoomSwitchWrapper(onViewChange)))

        return Promise.resolve(null);
    }

    const rootSwitchWrapper = createAbortedController().createAbortSwitchWrapper();


    function Room() {
        const roomStatus = roomStore(state => state.status);
        return <div>RoomStatus: {RoomStatus[roomStatus]}</div>
    }

    function RoomPage() {
        const toggleRoom = viewStore(state => state.toggleRoom);
        const isIdle = roomStore(state => state.status) === RoomStatus.Idle;
        return <>
            <Room />
            <div><button onClick={toggleRoom}>{isIdle ? 'connect' : 'disconnect'}</button></div>
            <Link to="/foo">To Foo</Link>
        </>
    }

    const router = createMemoryRouter([{
        path: '/',
        element: <RoomPage />,
        loader: rootSwitchWrapper(setupRoomPage)
    }, {
        path: '/foo',
        element: <div>Foo</div>,
        loader: rootSwitchWrapper(() => Promise.resolve(null)) // 增加了一个 /foo 页面，loader 也需要被 wrap，来触发 abort
    }])

    const user = userEvent.setup({
        delay: null,
    })
    render(<StrictMode>
        <RouterProvider router={router} />
    </StrictMode>)

    await actTimers();
    expect(screen.getByText('RoomStatus: Idle')).toBeTruthy()

    // When: 按一下 toggleRoom 开始连接，然后切换页面到 Foo
    {
        await user.click(screen.getByText('connect'))
        await user.click(screen.getByText('To Foo'))
    }

    await actTimers()
    expect(screen.getByText('Foo')).toBeTruthy()
    expect(roomStore.getState().status).toBe(RoomStatus.Idle)
})

/**
 * 至此，我们扩大了 AbortController 的能力，它既可以清理 Page 上的副作用，也可以阻止 Page 下面子组件的异步任务执行。仔细观察我们的代码，我们会发现，AbortContext 是一个
 * hierarchy 的树形结构，而且我们很自然地让父 controller 清理时，先清理了子 controller。但我们还没有思考过以下问题
 * 1. 为什么是一个树形结构，而不是一个链表结构
 * 2. 应该先清理父节点还是子节点
 * 3. AbortContext 的树形结构和组件树形结构有什么关系
 * 4. 为什么不用 useEffect
 * 
 * 这些问题，我们在下一个测试中讨论
 */