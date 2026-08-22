
import React, { Component, ErrorInfo, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

interface ErrorBoundaryProps {
  // Fix: Making children optional to resolve "property missing" errors in various TypeScript/React configurations
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Tạo Component bắt lỗi (Error Boundary) để hiển thị lỗi thay vì trắng màn hình
// Fix: Use explicit property access and ensured inheritance via property declarations to resolve TS "property missing" errors
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // Fix: Explicitly declare state to resolve "Property 'state' does not exist" errors
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  // Fix: Explicitly declare props to resolve "Property 'props' does not exist" errors in specific TypeScript environments
  public props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    // Fix: Manually assign props to ensure it's recognized in environments with inheritance issues
    this.props = props;
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: 'red', fontFamily: 'sans-serif' }}>
          <h1>Đã xảy ra lỗi! (Something went wrong)</h1>
          <pre style={{ background: '#f0f0f0', padding: '10px', borderRadius: '5px' }}>
            {this.state.error?.toString()}
          </pre>
          <p>Hãy kiểm tra lại Console (F12) để xem chi tiết.</p>
          <button onClick={() => window.location.reload()} style={{padding: '10px', cursor: 'pointer'}}>
            Tải lại trang
          </button>
        </div>
      );
    }

    // Fix: Correctly returning children from props with verified inheritance and direct access
    return this.props.children || null;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
