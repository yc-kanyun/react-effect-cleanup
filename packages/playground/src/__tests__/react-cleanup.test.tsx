import { test, afterEach, beforeEach, expect, vi } from "vitest"
import { render, screen, cleanup } from "@testing-library/react";
import { useEffect } from "react";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test("Parent/Child 的 effect 执行和清理过程测试", () => {
  const traceCleanup = vi.fn();
  function Node() {
    useEffect(() => {
      return () => {
        traceCleanup();
      };
    }, []);

    return <div>Node</div>;
  }

  render(<Node />);

  expect(screen.getByText("Node")).toBeTruthy();

  expect(traceCleanup).not.toBeCalled();

  cleanup();

  expect(traceCleanup).toBeCalled();
});
