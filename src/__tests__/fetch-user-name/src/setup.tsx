import { RouteObject } from "react-router-dom";
import { EffectContext, EffectController, EffectTransaction } from "../../../effect";
import toast from "react-hot-toast";
import { createUserStore } from "./store/user";
import { RootProvider } from "./store/root-context";
import { Home } from "./component/home";
import { createAbortSwitchWrapper } from "../../effect-util";

export interface AppContext {
    userStore: ReturnType<typeof createUserStore>,
    rootEffectController: EffectController,
    routes: RouteObject[]
}

/**
 * 在 Loading 状态时展示一个 toast，并在 loading 成功后 1000ms 后自动关闭
 * 
 * @param ctx 
 * @param userStore 
 */
function setupLoadingToastWithPerfectCleanup(ctx: EffectContext, userStore: ReturnType<typeof createUserStore>) {
    let loadingToastId: string | null = null;

    const txn = new EffectTransaction(ctx)
    txn.act(() => {
        return userStore.subscribe(state => {
            if (state._loading && !loadingToastId) {
                loadingToastId = toast.loading('Loading...')
            }

            if (!state._loading && loadingToastId) {
                const currToastId = loadingToastId
                loadingToastId = null

                txn.act(() => {
                    const timer = setTimeout(() => {
                        toast.dismiss(currToastId)
                    }, 1000)

                    return timer;
                }, (timer) => {
                    clearTimeout(timer)
                })
            }
        })
    }, (unsubscribe) => {
        unsubscribe()

        if (loadingToastId) {
            toast.dismiss(loadingToastId)
        }
    })
}

export function setupApp(): AppContext {
    const userStore = createUserStore()
    const rootEffectController = new EffectController({ debugLabel: 'root' })
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
