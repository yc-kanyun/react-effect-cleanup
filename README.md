# React 使用 Zustand 来实现状态管理与渲染分离

## 基本思路

- 所有的状态都管理在 zustand 中，zustand 来管理所有的请求发送和数据更新
- React 中不使用 useState 和 useEffect。所有的数据更新，都应该由 react 来调用 zustand 中的方法
- 使用 abort 来实现异步流程的取消和清理

## 加载流程

- main.tsx 中调用 setupApp 方法初始化各种全局 service

```typescript
const appContext = setupApp();
const router = createHashRouter(appContext.routes);

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
```

- 在 setupApp 中，初始化所有的 zustand store

```typescript
export function setupApp(): AppContext {
  const userStore = createUserStore();
  const rootEffectController = new EffectController("root");
  const effectContextWrapper =
    rootEffectController.createAbortSwitchWrapper("route");
  // ...
}
```

- routes 的 loader 方法直接引用这些 store，并实现页面的初始化。而不是依赖 effect 做类似的事情

```typescript
function setupHomePage(ctx: EffectContext) {
  // user name 不阻塞页面加载，局部展示 loading
  void userStore.getState().fetch(ctx);

  // 下面的写法可以阻塞页面加载，让 router 展示全局 loading
  // await userStore.getState().fetch(ctx)

  return Promise.resolve(null);
}
```

- 所有的 zustand 都挂载到 RootContext 中，相当于全局单例 service，在组件中通过 useContext 获取这些 store

```typescript
routes: [
  {
    path: "/",

    element: (
      <RootProvider
        userStore={userStore}
        rootEffectContext={rootEffectController}
      >
        <Home />
      </RootProvider>
    ),

    loader: effectContextWrapper(setupHomePage),
  },
];
```
