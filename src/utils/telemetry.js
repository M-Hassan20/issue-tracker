const os = require('os');
const mongoose = require('mongoose');

let poolStats = {
  currentCheckedOut: 0,
  peakCheckedOut: 0,
  totalCreated: 0,
  totalClosed: 0,
  checkOutFailures: 0,
  checkOutStarted: 0,
};

let lastCpuUsage = process.cpuUsage();
let lastCpuTime = Date.now();

function initTelemetry() {
  try {
    const client = mongoose.connection.getClient();
    if (client && typeof client.on === 'function') {
      client.on('connectionCreated', () => { poolStats.totalCreated++; });
      client.on('connectionClosed', () => { poolStats.totalClosed++; });
      client.on('connectionCheckOutStarted', () => { poolStats.checkOutStarted++; });
      client.on('connectionCheckedOut', () => {
        poolStats.currentCheckedOut++;
        if (poolStats.currentCheckedOut > poolStats.peakCheckedOut) {
          poolStats.peakCheckedOut = poolStats.currentCheckedOut;
        }
      });
      client.on('connectionCheckedIn', () => {
        if (poolStats.currentCheckedOut > 0) poolStats.currentCheckedOut--;
      });
      client.on('connectionCheckOutFailed', () => {
        poolStats.checkOutFailures++;
      });
    }
  } catch (err) {
    console.warn('Telemetry: Unable to attach Mongo pool listeners:', err.message);
  }
}

function getCpuPercent() {
  const currentUsage = process.cpuUsage();
  const currentTime = Date.now();
  const timeDeltaMs = currentTime - lastCpuTime || 1;
  const userDeltaMs = (currentUsage.user - lastCpuUsage.user) / 1000;
  const systemDeltaMs = (currentUsage.system - lastCpuUsage.system) / 1000;
  const totalCpuMs = userDeltaMs + systemDeltaMs;
  const cpus = os.cpus().length || 1;
  const cpuPercent = (totalCpuMs / (timeDeltaMs * cpus)) * 100;

  lastCpuUsage = currentUsage;
  lastCpuTime = currentTime;
  return Math.min(100, Math.max(0, parseFloat(cpuPercent.toFixed(2))));
}

function getMetrics() {
  const mem = process.memoryUsage();
  const totalSysMem = os.totalmem();
  const freeSysMem = os.freemem();
  const usedSysMem = totalSysMem - freeSysMem;

  return {
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    process: {
      cpuPercent: getCpuPercent(),
      memory: {
        rssMB: parseFloat((mem.rss / (1024 * 1024)).toFixed(2)),
        heapTotalMB: parseFloat((mem.heapTotal / (1024 * 1024)).toFixed(2)),
        heapUsedMB: parseFloat((mem.heapUsed / (1024 * 1024)).toFixed(2)),
        externalMB: parseFloat((mem.external / (1024 * 1024)).toFixed(2)),
      }
    },
    system: {
      cpuCount: os.cpus().length,
      totalMemoryMB: parseFloat((totalSysMem / (1024 * 1024)).toFixed(2)),
      freeMemoryMB: parseFloat((freeSysMem / (1024 * 1024)).toFixed(2)),
      memoryUsagePercent: parseFloat(((usedSysMem / totalSysMem) * 100).toFixed(2))
    },
    database: {
      readyState: mongoose.connection.readyState, // 1 = connected
      currentCheckedOut: poolStats.currentCheckedOut,
      peakCheckedOut: poolStats.peakCheckedOut,
      totalCreated: poolStats.totalCreated,
      totalClosed: poolStats.totalClosed,
      checkOutFailures: poolStats.checkOutFailures,
      poolConfiguredMax: 300,
      utilizationPercent: parseFloat(((poolStats.currentCheckedOut / 300) * 100).toFixed(2)),
      peakUtilizationPercent: parseFloat(((poolStats.peakCheckedOut / 300) * 100).toFixed(2))
    }
  };
}

function resetPeakMetrics() {
  poolStats.peakCheckedOut = poolStats.currentCheckedOut;
  poolStats.checkOutFailures = 0;
  lastCpuUsage = process.cpuUsage();
  lastCpuTime = Date.now();
  return { message: 'Peak metrics reset successfully', current: getMetrics() };
}

module.exports = {
  initTelemetry,
  getMetrics,
  resetPeakMetrics
};
