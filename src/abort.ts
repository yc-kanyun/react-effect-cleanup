import { useEffect, useState } from "react";

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
    createAbortSwitchWrapper: <Func extends AnyFunc>(childLabel: string) => AbortSwitchWrapperFn<Func>,

    /**
     * 返回一个子 controller, abortController 被 abort 时，也会 abort 子 controller
     * 
     * @returns 被 AbortContext 所管理的 controller
     */
    createController: (label: string) => AbortController
}

export interface AbortController extends AbortContext {
    abort: AbortFn,
}

let controllerCounter = 0
export function createAbortedController(label: string): AbortController {
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
            return wrappedCleanup;
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

export function useAbort(label: string, abortContext?: AbortContext): AbortContext | null {
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