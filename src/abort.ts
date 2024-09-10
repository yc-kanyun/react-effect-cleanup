export interface EffectControllerOptions {
    debugLabel?: string
}

export type AbortedFn = () => boolean;
export type AbortFn = () => void;
export type CleanupFn = () => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunc = (...args: any[]) => any;

export type AbortSwitchCallback<Func extends AnyFunc> = (
    effectContext: EffectContext,
    ...args: Parameters<Func>
) => ReturnType<Func>;
export type AbortSwitchWrapperFn<Func extends AnyFunc> = (cb: AbortSwitchCallback<Func>) => Func

interface ActionSuccessResult<T> {
    aborted: false,
    value: T,
    removeCleanup: () => void,
}

interface ActionErrorResult<T> {
    aborted: true,
    value?: T,
    removeCleanup: () => void,
}

type ActionResult<T> = ActionSuccessResult<T> | ActionErrorResult<T>

export interface EffectContext {
    aborted: AbortedFn,
    onAbort(cleanup: CleanupFn): () => void,
    race<T>(promise: Promise<T>): Promise<{ value: T, aborted: boolean }>,

    /**
     * 返回一个子 controller, effectController 被 abort 时，也会 abort 子 controller
     *
     * @returns 被 EffectContext 所管理的 controller
     */
    createController: (options?: EffectControllerOptions) => EffectController,

    action<T>(action: () => Promise<T> | T, cleanup?: CleanupFn): Promise<ActionResult<T>>
}

export class EffectController implements EffectContext {
    private readonly options: EffectControllerOptions;
    private readonly cleanupCallbacks: CleanupFn[] = [];
    private readonly childControllers: EffectController[] = [];
    private _aborted = false;

    constructor(options?: EffectControllerOptions) {
        this.options = { ...options }
    }

    private createChildController(options?: EffectControllerOptions): EffectController {
        const ctrl = new EffectController(options);
        this.childControllers.push(ctrl);

        ctrl.onAbort(() => {
            const idx = this.childControllers.indexOf(ctrl);
            if (idx >= 0) {
                this.childControllers.splice(idx, 1);
            }
        });

        return ctrl;
    }

    abort(): void {
        if (this._aborted) {
            return;
        }

        for (let i = this.childControllers.length - 1; i >= 0; i--) {
            this.childControllers[i].abort();
        }
        this.childControllers.length = 0;

        for (let i = this.cleanupCallbacks.length - 1; i >= 0; i--) {
            const cb = this.cleanupCallbacks[i];
            cb();
        }

        if (this.cleanupCallbacks.length > 0) {
            throw new Error('cleanup callbacks not empty');
        }

        this._aborted = true;
        if (this.options.debugLabel) {
            console.log(`[ABORT], id=${this.options.debugLabel}`);
        }
    }

    aborted(): boolean {
        return this._aborted;
    }

    onAbort(cleanup: CleanupFn): () => void {
        const wrappedCleanup = () => {
            cleanup();
            removeCleanup();
        };

        const removeCleanup = () => {
            const idx = this.cleanupCallbacks.indexOf(wrappedCleanup);
            if (idx >= 0) {
                this.cleanupCallbacks.splice(idx, 1);
            }
        };

        this.cleanupCallbacks.push(wrappedCleanup);
        return removeCleanup;
    }

    async race<T>(promise: Promise<T>): Promise<{ value: T; aborted: boolean }> {
        return { value: await promise, aborted: this._aborted };
    }

    createController(options?: EffectControllerOptions): EffectController {
        if (this._aborted) {
            throw new Error('aborted controller can\'t create child controller');
        }

        return this.createChildController(options);
    }

    async action<T>(action: () => Promise<T>, cleanup?: CleanupFn): Promise<ActionResult<T>> {
        if (this._aborted) {
            return { aborted: true, removeCleanup: () => void 0 };
        }

        const value = await action();
        const removeCleanup = this.onAbort(cleanup ?? (() => void 0));
        return { value, aborted: this._aborted, removeCleanup };
    }
}

export function createAbortedController(options?: EffectControllerOptions): EffectController {
    return new EffectController(options);
}

export function createAbortSwitchWrapper<Func extends AnyFunc>(effectContext: EffectContext, options?: EffectControllerOptions): AbortSwitchWrapperFn<Func> {
    let currCtrl: EffectController | null = null;
    effectContext.onAbort(() => {
        if (currCtrl) {
            currCtrl.abort();
            currCtrl = null;
        }
    })

    const retFunc: AbortSwitchWrapperFn<Func> = (cb: AbortSwitchCallback<Func>) => {
        return ((...args: Parameters<Func>): ReturnType<Func> => {
            if (currCtrl) {
                currCtrl.abort();
            }
            currCtrl = effectContext.createController(options);

            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return cb(currCtrl, ...args);
        }) as Func;
    };

    return retFunc;
}