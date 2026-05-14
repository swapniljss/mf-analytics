import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex items-center justify-center min-h-[400px] p-6">
          <div className="card max-w-md w-full text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-50 ring-1 ring-rose-200
                            dark:bg-rose-900/30 dark:ring-rose-700/50
                            flex items-center justify-center">
              <AlertTriangle size={28} className="text-rose-500 dark:text-rose-400" strokeWidth={1.8} />
            </div>
            <h3 className="mt-4 text-lg font-bold text-gray-900 dark:text-white">Something went wrong</h3>
            <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
              {this.state.error?.message || 'An unexpected error occurred rendering this page.'}
            </p>
            <button onClick={this.handleReset} className="btn-primary mt-5 mx-auto">
              <RefreshCw size={14} />
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
