import '@testing-library/jest-dom/jest-globals'
import { test, expect, jest, beforeEach, afterEach } from "@jest/globals"
import { render, screen, cleanup } from "@testing-library/react"
import { useEffect } from 'react'

beforeEach(() => {
    jest.useFakeTimers()
})

afterEach(() => {
    jest.useRealTimers()
})

test('Parent/Child 的 effect 执行和清理过程测试', () => {
    const traceCleanup = jest.fn()
    function Node() {
        useEffect(() => {
            return () => {
                traceCleanup()
            }
        }, [])

        return <div>Node</div>
    }

    render(<Node />)

    expect(screen.getByText('Node')).toBeInTheDocument()

    expect(traceCleanup).not.toBeCalled()

    cleanup()

    expect(traceCleanup).toBeCalled()
})