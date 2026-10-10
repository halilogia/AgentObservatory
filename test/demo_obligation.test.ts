import assert from 'node:assert';
import { calculateMetrics, divideMetrics } from '../src/demo_obligation.ts';

console.log('🧪 Testing demo_obligation functions...');

// Test calculateMetrics
const metrics = calculateMetrics([10, 20, 30]);
assert.strictEqual(metrics.sum, 60, 'Sum should be 60');
assert.strictEqual(metrics.avg, 20, 'Average should be 20');

// Test calculateMetrics with empty array
const emptyMetrics = calculateMetrics([]);
assert.strictEqual(emptyMetrics.sum, 0);
assert.strictEqual(emptyMetrics.avg, 0);

// Test divideMetrics
assert.strictEqual(divideMetrics(10, 2), 5);
assert.throws(() => divideMetrics(10, 0), /Division by zero/);

console.log('✔ demo_obligation tests passed cleanly!\n');
