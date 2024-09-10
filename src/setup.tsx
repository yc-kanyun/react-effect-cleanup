import { RouteObject } from "react-router-dom";
import { EffectContext, EffectController, createAbortedController, createAbortSwitchWrapper } from "./effect";
import { Home } from "./component/home";
import { createUserStore } from "./store/user";
import { RootProvider } from "./store/root-context";
import toast from "react-hot-toast";

export interface AppContext {
    userStore: ReturnType<typeof createUserStore>,
    rootEffectController: EffectController,
    routes: RouteObject[]
}

/**
 * 在 Loading 状态时展示一个 toast，并在 loading 成功后 1000ms 后自动关闭
 * 
 * @param pageEffectContext 
 * @param userStore 
 */
function setupLoadingToastWithPerfectCleanup(pageEffectContext: EffectContext, userStore: ReturnType<typeof createUserStore>) {
    let loadingToastId: string | null = null;
    // 切换页面时立即取消 toast
    pageEffectContext.onAbort(() => {
        if (loadingToastId) {
            toast.dismiss(loadingToastId)
        }
    })

    pageEffectContext.onAbort(userStore.subscribe(state => {
        if (state._loading && !loadingToastId) {
            loadingToastId = toast.loading('Loading...')
        }

        if (!state._loading && loadingToastId) {
            const currToastId = loadingToastId
            loadingToastId = null

            const timer = setTimeout(() => {
                toast.dismiss(currToastId)
            }, 1000)
            pageEffectContext.onAbort(() => {
                clearTimeout(timer)
            })
        }
    }))
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function setupLoadingToastWithoutCleanup(ctx: EffectContext, userStore: ReturnType<typeof createUserStore>) {
    let loadingToastId: string | null = null;
    ctx.onAbort(userStore.subscribe(state => {
        if (state._loading && !loadingToastId) {
            loadingToastId = toast.loading('Loading...')
        }

        if (!state._loading && loadingToastId) {
            const currToastId = loadingToastId
            setTimeout(() => {
                toast.dismiss(currToastId)
            }, 1000)

            loadingToastId = null
        }
    }))
}

export function setupApp(): AppContext {
    const userStore = createUserStore()
    const rootEffectController = createAbortedController({ debugLabel: 'root' })
    const switchContext = createAbortSwitchWrapper(rootEffectController, { debugLabel: 'route' })

    function setupHomePage(ctx: EffectContext) {
        // 下面的写法可以阻塞页面加载，让 router 展示全局 loading
        // await userStore.getState().fetch(ctx)

        setupLoadingToastWithPerfectCleanup(ctx, userStore)
        // setupLoadingToastWithoutCleanup(ctx, userStore)

        // user name 不阻塞页面加载，局部展示 loading
        void userStore.getState().fetch(ctx)
        return Promise.resolve(null)
    }

    return {
        userStore,
        rootEffectController,
        routes: [
            {
                path: '/',

                element: <RootProvider userStore={userStore} rootEffectContext={rootEffectController}>
                    <Home />
                </RootProvider>,

                loader: switchContext(setupHomePage)
            },
            {
                path: '/foo',

                element: <RootProvider userStore={userStore} rootEffectContext={rootEffectController}>
                    <div>Foo Page</div>
                </RootProvider>,

                loader: switchContext(() => Promise.resolve(null))
            }
        ]
    }
}
