import 'whatwg-fetch'
import { test, expect, jest, afterEach, beforeEach } from "@jest/globals"
import { act, render, screen } from "@testing-library/react"
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { StrictMode } from 'react'
import { create } from 'zustand'

async function sleep(time: number) {
    return new Promise(r => setTimeout(r, time))
}

async function actTimers() {
    await act(async () => {
        await jest.runAllTimersAsync()
    })
}

afterEach(() => {
    expect(jest.getTimerCount()).toBe(0)
})

beforeEach(() => {
    expect(jest.getTimerCount()).toBe(0)
})

/**
 * 在这个例子中，当用户点击 toggleRoom 按钮时，会在 connect/disconnect 方法中切换执行
 * 进行 connect 会在 100ms 后设置连接状态是 conntected，所以如果用户连续点击 toggleRoom 按钮，那么状态的设置顺序是
 * 
 *         v-- connect()   v--- disconnect()
 *   Idle ---> Connecting ---> Idle ------- 100ms --------> Connected
 *              
 * 这不是我们期望的，我们希望在调用 disconnect() 之后，能 abort 最后一次 connected 状态的设置
 * 在下面的测试中，我们首先展示问题是如何出现的。首先从 setupRoomPage 开始
 */
test('不切换 route 情况下，异步任务得不到清理的例子', async () => {
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
        return <>
            <Room />
            <div><button onClick={toggleRoom}>toggleRoom</button></div>
        </>
    }

    /*
      setupRoomPage 方法被 router loader 加载，在这个方法中，我们订阅了 viewState 的变化，来控制调用 connect / disconnect
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

        expect(await screen.findByText('RoomStatus: Idle')).toBeTruthy()
    }


    // When: 连续两次点击 toggleRoom 按钮
    {
        // When: 点击 toggleRoom 按钮打开房间，开始进行连接
        const toggleButton = await screen.findByText('toggleRoom')
        act(() => {
            toggleButton.click()
        })

        // Then: 房间状态变成连接中 / Connecting
        expect(await screen.findByText('RoomStatus: Connecting')).toBeTruthy()

        // When: 在 Connecting 状态下，点击按钮关闭 Room
        act(() => {
            toggleButton.click()
        })
        // Then: 此时房间状态应该是 Idle
        expect(await screen.findByText('RoomStatus: Idle')).toBeTruthy()

        // When: 清空 timer 队列，看页面最终状态
        await actTimers()
    }

    // Then: 可以发现 toggleRoom 后，前一个 timer 仍然执行了导致状态变为已连接
    expect(await screen.findByText('RoomStatus: Connected')).toBeTruthy()
})

test('泛化 abortContext，解决 state 驱动的异步取消问题', async () => {
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
    type AbortSwitchWrapperFn<T> = (cb: (abortContext: AbortContext, ...args: any[]) => Promise<T>) => () => Promise<T>

    interface AbortContext {
        aborted: AbortedFn,
        onAbort(cleanup: CleanupFn): void,
        race<T>(promise: Promise<T>): Promise<{ value: T, aborted: boolean }>,

        /**
         * 返回一个子 switchContext，当前 abortContext 被 abort 时，也会 abort 子 switchContext
         * 
         * @returns 被 AbortContext 所管理的 switchWrapper
         */
        createAbortSwitchWrapper: <T>() => AbortSwitchWrapperFn<T>,
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

            createAbortSwitchWrapper: () => {
                let currCtrl: AbortController | null = null;
                cleanupCallbacks.push(() => {
                    if (currCtrl) {
                        currCtrl.abort()
                        currCtrl = null;
                    }
                })

                return (cb) => {
                    return async function (...args) {
                        if (currCtrl) {
                            currCtrl.abort();
                        }
                        currCtrl = createAbortedController();
                        return await cb(currCtrl, ...args)
                    }
                }
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
        const onViewChange = async (abortCtx: AbortContext, state: ViewStore) => {
            if (state.showRoom) {
                void roomStore.getState().connect(abortCtx, 100)
                return;
            }

            roomStore.getState().disconnect()
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
            return <>
                <Room />
                <div><button onClick={toggleRoom}>toggleRoom</button></div>
            </>
        }

        const router = createMemoryRouter([{
            path: '/',
            element: <RoomPage />,
            loader: rootSwitchWrapper(setupRoomPage)
        }])


        render(<StrictMode>
            <RouterProvider router={router} />
        </StrictMode>)

        expect(await screen.findByText('RoomStatus: Idle')).toBeTruthy()

        const toggleButton = await screen.findByText('toggleRoom')
        act(() => {
            toggleButton.click()
        })

        expect(await screen.findByText('RoomStatus: Connecting')).toBeTruthy()

        act(() => {
            toggleButton.click()
        })
        expect(await screen.findByText('RoomStatus: Idle')).toBeTruthy()

        // When: 清空 timer 队列
        await actTimers()
    }

    // 下面的断言和上一个测试有区别，这是我们期望的结果
    // Then: 房间状态是 Idle，因为 Connecting 的回调被取消了
    expect(await screen.findByText('RoomStatus: Idle')).toBeTruthy()
})