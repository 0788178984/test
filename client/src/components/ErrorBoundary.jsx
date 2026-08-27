import React from 'react';
import { AlertTriangle } from 'lucide-react';
import Button from './ui/Button';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('UI error:', error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.assign('/dashboard');
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
            <AlertTriangle className="w-14 h-14 text-amber-500 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-gray-900">Something went wrong</h1>
            <p className="text-sm text-gray-600 mt-2 mb-6">
              {this.state.error?.message || 'An unexpected error occurred in this screen.'}
            </p>
            <Button variant="primary" onClick={this.handleReload}>
              Back to dashboard
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
