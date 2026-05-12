import React from 'react'
import { AlertTriangle } from 'lucide-react'

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
        <div className="flex flex-col items-center justify-center min-h-[300px] p-8 text-center gap-3">
          <AlertTriangle size={36} className="text-red-400" />
          <h3 className="text-base font-semibold text-gray-800">Something went wrong</h3>
          <p className="text-sm text-gray-500 max-w-md">
            {this.state.error?.message || 'An unexpected error occurred rendering this page.'}
          </p>
          <button
            onClick={this.handleReset}
            className="mt-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
