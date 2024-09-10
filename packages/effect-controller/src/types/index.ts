import type { EffectController } from '../chore'

export interface EffectControllerOptions {
    debugLabel?: string
}

export type AbortedFn = () => boolean
export type AbortFn = () => void
export type ActionCleanupFn<T> = (value: T) => void

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFunc = (...args: any[]) => any

export type EffectSwitchCallback<Func extends AnyFunc> = (
    effectContext: EffectContext,
    ...args: Parameters<Func>
) => ReturnType<Func>

export type EffectSwitchWrapperFn<Func extends AnyFunc> = (cb: EffectSwitchCallback<Func>) => Func

export interface ActionSuccessResult<T> {
    aborted: false
    value: T
    removeCleanup: () => void
}

export interface ActionErrorResult<T> {
    aborted: true
    value?: T
    removeCleanup: () => void
}

export type ActionResult<T> = ActionSuccessResult<T> | ActionErrorResult<T>

export interface EffectContext {
    aborted: AbortedFn

    onAbort(cleanup: AbortFn): () => void

    /**
     * 返回一个子 controller, effectController 被 abort 时，也会 abort 子 controller
     *
     * @returns 被 EffectContext 所管理的 controller
     */
    createController: (options?: EffectControllerOptions) => EffectController
}
