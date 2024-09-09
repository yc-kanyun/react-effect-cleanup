export interface AbortControllerOptions {
    debugLabel?: string
}

export type AbortedFn = () => boolean;
export type AbortFn = () => void;
export type CleanupFn = () => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunc = (...args: any[]) => any;
export type AbortSwitchCallback<Func extends AnyFunc> = (
    abortContext: AbortContext,
    ...args: Parameters<Func>
) => ReturnType<Func>;
export type AbortSwitchWrapperFn<Func extends AnyFunc> = (cb: AbortSwitchCallback<Func>) => Func

export interface AbortContext {
    aborted: AbortedFn,
    onAbort(cleanup: CleanupFn): () => void,
    race<T>(promise: Promise<T>): Promise<{ value: T, aborted: boolean }>,

    /**
     * 返回一个子 switchContext，当前 abortContext 被 abort 时，也会 abort 子 switchContext
     *
     * @returns 被 AbortContext 所管理的 switchWrapper
     */
    createAbortSwitchWrapper: <Func extends AnyFunc>(options?: AbortControllerOptions) => AbortSwitchWrapperFn<Func>,

    /**
     * 返回一个子 controller, abortController 被 abort 时，也会 abort 子 controller
     *
     * @returns 被 AbortContext 所管理的 controller
     */
    createController: (options?: AbortControllerOptions) => AbortController
}

export interface AbortController extends AbortContext {
    abort: AbortFn,
}

let controllerCounter = 0
export function createAbortedController(options?: AbortControllerOptions): AbortController {
    const currCount = controllerCounter++;
    const controllerId = `${options?.debugLabel ?? ''}-${String(currCount)}`
    console.log(`[CREATE], id=${controllerId}`)
    const cleanupCallbacks: CleanupFn[] = []
    const childControllers: AbortController[] = []
    let aborted = false;

    function createChildController(options?: AbortControllerOptions) {
        const ctrl = createAbortedController(options);
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
            if (aborted) {
                return;
            }

            for (let i = childControllers.length - 1; i >= 0; i--) {
                childControllers[i].abort()
            }
            childControllers.length = 0

            for (let i = cleanupCallbacks.length - 1; i >= 0; i--) {
                const cb = cleanupCallbacks[i]
                cb();
            }

            if (cleanupCallbacks.length > 0) {
                throw new Error('cleanup callbacks not empty')
            }

            aborted = true;
            console.log(`[ABORT], id=${controllerId}`)
        },

        aborted: () => aborted,

        onAbort: (cleanup: CleanupFn) => {
            const wrappedCleanup = () => {
                cleanup();
                removeCleanup();
            }

            const removeCleanup = () => {
                const idx = cleanupCallbacks.indexOf(wrappedCleanup);
                if (idx >= 0) {
                    cleanupCallbacks.splice(idx, 1)
                }
            }

            cleanupCallbacks.push(wrappedCleanup);
            return removeCleanup;
        },

        race: async function <T>(promise: Promise<T>) {
            return { value: await promise, aborted }
        },

        createAbortSwitchWrapper: <Func extends AnyFunc>(options?: AbortControllerOptions) => {
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
                    currCtrl = createChildController(options);

                    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                    return cb(currCtrl, ...args)
                } as Func
            }

            return retFunc;
        },

        createController: (options?: AbortControllerOptions) => {
            return createChildController(options);
        }
    }
}
