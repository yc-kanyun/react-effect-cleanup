import { RouteObject } from "react-router-dom";
import { AbortContext, AbortController, createAbortedController } from "./abort";
import { Home } from "./component/home";
import { createUserStore } from "./store/user";
import { RootProvider } from "./store/root-context";
import toast from "react-hot-toast";

export interface AppContext {
    userStore: ReturnType<typeof createUserStore>,
    rootAbortController: AbortController,
    routes: RouteObject[]
}

export function setupApp(): AppContext {
    const userStore = createUserStore()
    const rootAbortController = createAbortedController('root')
    const abortContextWrapper = rootAbortController.createAbortSwitchWrapper('route')

    function setupHomePage(ctx: AbortContext) {
        // user name 不阻塞页面加载，局部展示 loading
        void userStore.getState().fetch(ctx)

        // 下面的写法可以阻塞页面加载，让 router 展示全局 loading
        // await userStore.getState().fetch(ctx)

        let loadingToastId: string | null = null;
        ctx.onAbort(userStore.subscribe(state => {
            if (state._loading && !loadingToastId) {
                loadingToastId = toast.loading('Loading...')
            }

            if (!state._loading && loadingToastId) {
                const currToastId = loadingToastId
                const timer = setTimeout(() => {
                    toast.dismiss(currToastId)
                }, 1000)
                ctx.onAbort(() => {
                    clearTimeout(timer)
                })
                loadingToastId = null
            }
        }))

        return Promise.resolve(null)
    }

    return {
        userStore,
        rootAbortController,
        routes: [
            {
                path: '/',

                element: <RootProvider userStore={userStore} rootAbortContext={rootAbortController}>
                    <Home />
                </RootProvider>,

                loader: abortContextWrapper(setupHomePage)
            }
        ]
    }
}
