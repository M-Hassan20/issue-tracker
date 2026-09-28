const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const TIERS = [150, 250, 500, 750, 1000];
const RESULTS_DIR = path.join(__dirname, 'results');

if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTelemetry() {
  try {
    const res = await fetch(`${BASE_URL}/metrics`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    // ignore transient fetch errors
  }
  return null;
}

async function resetTelemetry() {
  try {
    await fetch(`${BASE_URL}/metrics/reset`, { method: 'POST' });
  } catch (err) {
    // ignore
  }
}

async function runTier(vus, durationSeconds = 60) {
  console.log(`\n======================================================`);
  console.log(`   RUNNING SCALE TIER: ${vus} CONCURRENT USERS (VUs)`);
  console.log(`   Duration: ${durationSeconds}s (${Math.floor(durationSeconds/6)}s ramp, ${Math.floor(durationSeconds*2/3)}s steady, ${Math.floor(durationSeconds/6)}s cool)`);
  console.log(`======================================================`);

  await resetTelemetry();
  await sleep(1000);

  const rampTime = `${Math.max(5, Math.floor(durationSeconds / 5))}s`;
  const steadyTime = `${Math.floor(durationSeconds * 3 / 5)}s`;
  const coolTime = `${Math.max(5, Math.floor(durationSeconds / 5))}s`;

  // Create temporary scenario script for this specific tier
  const testScriptPath = path.join(__dirname, `temp_run_${vus}.js`);
  const summaryJsonPath = path.join(RESULTS_DIR, `summary_${vus}vus.json`);

  const scriptContent = `
import http from 'k6/http';
import { check, sleep } from 'k6';
import defaultFunc, { setup as baseSetup } from './load_test.js';

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  scenarios: {
    tiered_load: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '${rampTime}', target: ${vus} },
        { duration: '${steadyTime}', target: ${vus} },
        { duration: '${coolTime}', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<5000', 'p(99)<10000'],
    http_req_failed: ['rate<0.15'],
  },
};

export function setup() {
  return baseSetup();
}

export default function(data) {
  defaultFunc(data);
}
`;

  fs.writeFileSync(testScriptPath, scriptContent, 'utf-8');

  // Start telemetry sampler in background
  const telemetrySamples = [];
  let samplingActive = true;

  const samplerPromise = (async () => {
    while (samplingActive) {
      const data = await fetchTelemetry();
      if (data) {
        telemetrySamples.push(data);
      }
      await sleep(1500);
    }
  })();

  // Execute k6
  console.log(`Starting k6 runner for ${vus} VUs...`);
  const k6Cmd = `k6 run --summary-export="${summaryJsonPath}" "${testScriptPath}"`;
  let k6Failed = false;

  try {
    execSync(k6Cmd, {
      cwd: __dirname,
      stdio: 'inherit',
      env: { ...process.env, BASE_URL }
    });
  } catch (err) {
    console.warn(`k6 exited with status non-zero (likely threshold breach): ${err.message}`);
    k6Failed = true;
  }

  samplingActive = false;
  await samplerPromise;

  // Clean up temporary script
  if (fs.existsSync(testScriptPath)) {
    fs.unlinkSync(testScriptPath);
  }

  // Parse k6 summary
  let k6Summary = null;
  if (fs.existsSync(summaryJsonPath)) {
    try {
      k6Summary = JSON.parse(fs.readFileSync(summaryJsonPath, 'utf-8'));
    } catch (e) {
      console.error('Failed to parse k6 summary JSON:', e.message);
    }
  }

  // Compute telemetry aggregates
  let avgCpu = 0;
  let peakCpu = 0;
  let avgRss = 0;
  let peakRss = 0;
  let avgHeap = 0;
  let peakHeap = 0;
  let avgDbCheckedOut = 0;
  let peakDbCheckedOut = 0;
  let maxFailures = 0;

  if (telemetrySamples.length > 0) {
    let cpuSum = 0;
    let rssSum = 0;
    let heapSum = 0;
    let dbSum = 0;

    for (const s of telemetrySamples) {
      const cpu = s.process.cpuPercent || 0;
      const rss = s.process.memory.rssMB || 0;
      const heap = s.process.memory.heapUsedMB || 0;
      const db = s.database.currentCheckedOut || 0;
      const peakDb = s.database.peakCheckedOut || 0;
      const failures = s.database.checkOutFailures || 0;

      cpuSum += cpu;
      rssSum += rss;
      heapSum += heap;
      dbSum += db;

      if (cpu > peakCpu) peakCpu = cpu;
      if (rss > peakRss) peakRss = rss;
      if (heap > peakHeap) peakHeap = heap;
      if (peakDb > peakDbCheckedOut) peakDbCheckedOut = peakDb;
      if (failures > maxFailures) maxFailures = failures;
    }

    avgCpu = parseFloat((cpuSum / telemetrySamples.length).toFixed(2));
    peakCpu = parseFloat(peakCpu.toFixed(2));
    avgRss = parseFloat((rssSum / telemetrySamples.length).toFixed(2));
    peakRss = parseFloat(peakRss.toFixed(2));
    avgHeap = parseFloat((heapSum / telemetrySamples.length).toFixed(2));
    peakHeap = parseFloat(peakHeap.toFixed(2));
    avgDbCheckedOut = parseFloat((dbSum / telemetrySamples.length).toFixed(2));
  }

  const durationMetrics = k6Summary?.metrics?.http_req_duration?.values || {};
  const failedMetrics = k6Summary?.metrics?.http_req_failed?.values || {};
  const reqsMetrics = k6Summary?.metrics?.http_reqs?.values || {};

  const result = {
    vus,
    totalRequests: reqsMetrics.count || 0,
    requestsPerSecond: parseFloat((reqsMetrics.rate || 0).toFixed(2)),
    errorRatePercent: parseFloat(((failedMetrics.rate || 0) * 100).toFixed(2)),
    latency: {
      avgMs: parseFloat((durationMetrics.avg || 0).toFixed(2)),
      minMs: parseFloat((durationMetrics.min || 0).toFixed(2)),
      medMs: parseFloat((durationMetrics.med || 0).toFixed(2)),
      p90Ms: parseFloat((durationMetrics['p(90)'] || 0).toFixed(2)),
      p95Ms: parseFloat((durationMetrics['p(95)'] || 0).toFixed(2)),
      p99Ms: parseFloat((durationMetrics['p(99)'] || 0).toFixed(2)),
      maxMs: parseFloat((durationMetrics.max || 0).toFixed(2)),
    },
    resources: {
      cpu: {
        avgPercent: avgCpu,
        peakPercent: peakCpu
      },
      memory: {
        avgRssMB: avgRss,
        peakRssMB: peakRss,
        avgHeapUsedMB: avgHeap,
        peakHeapUsedMB: peakHeap
      },
      database: {
        poolConfiguredMax: 300,
        avgConnectionsCheckedOut: avgDbCheckedOut,
        peakConnectionsCheckedOut: peakDbCheckedOut,
        peakPoolUtilizationPercent: parseFloat(((peakDbCheckedOut / 300) * 100).toFixed(2)),
        checkoutFailures: maxFailures
      }
    }
  };

  console.log(`\nTier ${vus} VUs Result:`);
  console.log(`  Requests: ${result.totalRequests} | Throughput: ${result.requestsPerSecond} req/s | Error Rate: ${result.errorRatePercent}%`);
  console.log(`  Latency: Avg=${result.latency.avgMs}ms | P90=${result.latency.p90Ms}ms | P95=${result.latency.p95Ms}ms | P99=${result.latency.p99Ms}ms | Max=${result.latency.maxMs}ms`);
  console.log(`  CPU: Avg ${result.resources.cpu.avgPercent}%, Peak ${result.resources.cpu.peakPercent}%`);
  console.log(`  Memory (RSS): Peak ${result.resources.memory.peakRssMB} MB | Heap: Peak ${result.resources.memory.peakHeapUsedMB} MB`);
  console.log(`  DB Pool: Peak ${result.resources.database.peakConnectionsCheckedOut}/300 (${result.resources.database.peakPoolUtilizationPercent}%) | Failures: ${result.resources.database.checkoutFailures}`);

  return result;
}

async function main() {
  console.log('Verifying API server connectivity...');
  const initMetrics = await fetchTelemetry();
  if (!initMetrics) {
    console.error('Cannot connect to API server at', BASE_URL);
    process.exit(1);
  }
  console.log(`Connected to API server (Node v${process.version}, Mongo readyState=${initMetrics.database.readyState}).`);

  const allResults = [];
  for (const vu of TIERS) {
    // 50s duration per tier: 10s ramp, 30s steady peak, 10s cool down
    const tierResult = await runTier(vu, 50);
    allResults.push(tierResult);
    console.log(`Cooling down 5s before next tier...`);
    await sleep(5000);
  }

  const finalSummaryPath = path.join(RESULTS_DIR, 'comprehensive_scalability_summary.json');
  fs.writeFileSync(finalSummaryPath, JSON.stringify(allResults, null, 2), 'utf-8');
  console.log(`\n======================================================`);
  console.log(`ALL TIERS COMPLETE! Results saved to: ${finalSummaryPath}`);
  console.log(`======================================================`);
}

main().catch((err) => {
  console.error('Benchmark suite error:', err);
  process.exit(1);
});
