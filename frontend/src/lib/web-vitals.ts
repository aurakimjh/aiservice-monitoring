// Web Vitals monitoring — reports CWV metrics for performance tracking
// Usage: call reportWebVitals() once in the app root

type MetricName = 'CLS' | 'FCP' | 'FID' | 'INP' | 'LCP' | 'TTFB';

interface WebVitalMetric {
  name: MetricName;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
}

const thresholds: Record<MetricName, [number, number]> = {
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  FID: [100, 300],
  INP: [200, 500],
  LCP: [2500, 4000],
  TTFB: [800, 1800],
};

function getRating(name: MetricName, value: number): 'good' | 'needs-improvement' | 'poor' {
  const [good, poor] = thresholds[name];
  if (value <= good) return 'good';
  if (value <= poor) return 'needs-improvement';
  return 'poor';
}

export function reportWebVitals(onReport?: (metric: WebVitalMetric) => void) {
  if (typeof window === 'undefined') return;

  const report = (name: MetricName, value: number) => {
    const metric: WebVitalMetric = { name, value, rating: getRating(name, value) };
    onReport?.(metric);
    if (process.env.NODE_ENV === 'development') {
      const color = metric.rating === 'good' ? '#3FB950' : metric.rating === 'needs-improvement' ? '#D29922' : '#F85149';
      console.log(`%c[WebVital] ${name}: ${Math.round(value)}ms (${metric.rating})`, `color: ${color}`);
    }
  };

  // Use PerformanceObserver for modern metrics
  try {
    // LCP
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) report('LCP', last.startTime);
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

    // FCP
    const fcpObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          report('FCP', entry.startTime);
        }
      }
    });
    fcpObserver.observe({ type: 'paint', buffered: true });

    // CLS
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!(entry as any).hadRecentInput) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          clsValue += (entry as any).value;
        }
      }
      report('CLS', clsValue);
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });
  } catch {
    // PerformanceObserver not supported
  }
}
