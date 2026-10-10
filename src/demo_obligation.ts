export function calculateMetrics(values: number[]): { sum: number; avg: number } {
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = values.length > 0 ? sum / values.length : 0;
  return { sum, avg };
}

export function divideMetrics(a: number, b: number): number {
  if (b === 0) throw new Error('Division by zero');
  return a / b;
}

