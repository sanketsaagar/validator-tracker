// ChartGenerator.js
const fs = require('fs-extra');
const { format, subMonths, isAfter } = require('date-fns');

class ChartGenerator {
  constructor() {
    this.width = 1200;
    this.height = 800;
    this.chartsEnabled = false;

    try {
      const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
      this.chartJSNodeCanvas = new ChartJSNodeCanvas({
        width: this.width,
        height: this.height,
        backgroundColour: 'white',
      });
      this.chartsEnabled = true;
    } catch (error) {
      console.log('📊 Chart generation disabled - chart dependencies not available');
      console.log('   Install with: npm install chart.js chartjs-node-canvas');
      this.chartsEnabled = false;
    }
  }

  // -----------------------
  // Helpers / introspection
  // -----------------------
  _getValidatorId(tracker) {
    return (
      tracker?.validatorId ??
      tracker?.id ??
      tracker?.validator?.id ??
      'unknown'
    );
  }

  _getMonths(tracker) {
    const m =
      tracker?.options?.months ??
      tracker?.monthsBack ??
      tracker?.months ??
      6;
    const n = Number(m);
    return Number.isFinite(n) && n > 0 ? n : 6;
  }

  _firstDefined(...vals) {
    for (const v of vals) if (v !== undefined) return v;
    return undefined;
  }

  _normalizeEventBase(e) {
    if (!e) return null;

    // time
    const rawTime = this._firstDefined(
      e.time,
      e.timestamp,
      e.date,
      e.blockTime,
      e.blockTimestamp
    );
    const time = rawTime instanceof Date ? rawTime : new Date(rawTime);
    if (!(time instanceof Date) || Number.isNaN(time.getTime())) return null;

    // generic amount (positive)
    let amount = Number(
      this._firstDefined(
        e.amount, e.value, e.qty, e.tokens, e.pol, e.polAmount,
        // if delta/change provided and no amount, use absolute for magnitude
        Math.abs(Number(this._firstDefined(e.delta, e.change)))
      )
    );
    if (!Number.isFinite(amount) || amount <= 0) return null;

    const address = this._firstDefined(
      e.address, e.delegator, e.from, e.sender, e.wallet, e.account
    );

    return { time, amount, address };
  }

  _normalizeEventWithType(e, forcedType /* 'delegate' | 'unbond' */) {
    const base = this._normalizeEventBase(e);
    if (!base) return null;

    if (forcedType) {
      return { ...base, type: forcedType };
    }

    // infer from type/kind/action or delta/change sign
    const rawType = String(this._firstDefined(e.type, e.kind, e.action, '')).toLowerCase();
    const delta = Number(this._firstDefined(e.delta, e.change));

    let type = null;
    if (rawType.includes('unbond') || rawType.includes('undelegate')) type = 'unbond';
    else if (rawType.includes('delegate') || rawType.includes('bond')) type = 'delegate';
    else if (Number.isFinite(delta)) type = delta < 0 ? 'unbond' : 'delegate';

    if (!type) return null;
    return { ...base, type };
  }

  _pullArray(obj, key) {
    const arr = obj?.[key];
    return Array.isArray(arr) ? arr : [];
    }

  _collectEvents(tracker) {
    // direct consolidated arrays first (if any)
    const consolidated = [
      tracker?.events,
      tracker?.stakeEvents,
      tracker?.activityLog,
      tracker?.history,
      tracker?.changes,
      tracker?.actions,
    ].find(a => Array.isArray(a) && a.length);

    let events = [];
    if (consolidated) {
      events = consolidated
        .map(e => this._normalizeEventWithType(e /* infer type */))
        .filter(Boolean);
    }

    // derive from separate arrays: delegations + unbonds
    // search common locations on tracker and nested helpers
    const pools = [];

    const maybeObjs = [
      tracker,
      tracker?.analysis,
      tracker?.latestAnalysis,
      tracker?.lastAnalysis,
      tracker?._analysis,
      tracker?._analysisCache,
      tracker?.results,
      tracker?.ethereumDelegationTracker,
      tracker?.ethereumTracker,
      tracker?.delegationTracker,
      tracker?.polygonTracker,
    ].filter(Boolean);

    for (const ctx of maybeObjs) {
      pools.push(
        { arr: this._pullArray(ctx, 'delegations'), type: 'delegate', label: 'delegations' },
        { arr: this._pullArray(ctx, 'delegationEvents'), type: 'delegate', label: 'delegationEvents' },
        { arr: this._pullArray(ctx, 'ethereumDelegations'), type: 'delegate', label: 'ethereumDelegations' },
        { arr: this._pullArray(ctx, 'buyVouchers'), type: 'delegate', label: 'buyVouchers' }, // common ETH pattern

        { arr: this._pullArray(ctx, 'unbonds'), type: 'unbond', label: 'unbonds' },
        { arr: this._pullArray(ctx, 'unbondEvents'), type: 'unbond', label: 'unbondEvents' },
        { arr: this._pullArray(ctx, 'unbondingEvents'), type: 'unbond', label: 'unbondingEvents' },
      );
    }

    let addedFromPools = 0;
    for (const { arr, type, label } of pools) {
      if (!arr || arr.length === 0) continue;
      const before = events.length;
      for (const e of arr) {
        const n = this._normalizeEventWithType(e, type);
        if (n) events.push(n);
      }
      const delta = events.length - before;
      if (delta > 0) {
        console.log(`🔎 collected ${delta} ${label} as ${type}`);
        addedFromPools += delta;
      }
    }

    return events;
  }

  _buildTimeSeriesFromTracker(tracker, { debugLabel } = {}) {
    const validatorId = this._getValidatorId(tracker);
    const months = this._getMonths(tracker);

    // 1) collect all events we can find
    let normalized = this._collectEvents(tracker);

    console.log(`🔎 [${debugLabel || 'series'}] Validator ${validatorId}: total gathered events = ${normalized.length}`);

    // 2) filter by months; if that empties it, retry WITHOUT filter (but warn)
    const applyWindow = (arr) => {
      if (!(months && Number.isFinite(months) && months > 0)) return arr;
      const cutoff = subMonths(new Date(), months);
      const filtered = arr.filter((e) => isAfter(e.time, cutoff));
      console.log(`🔎 [${debugLabel || 'series'}] after ${months}m filter: ${filtered.length} (cutoff ${cutoff.toISOString().slice(0,10)})`);
      return filtered;
    };

    let filtered = applyWindow(normalized);

    if (normalized.length > 0 && filtered.length === 0) {
      console.warn(`⚠️  [${debugLabel || 'series'}] all events fell outside the ${months}m window; plotting full history instead.`);
      filtered = normalized;
    }

    if (filtered.length > 0) {
      filtered.sort((a, b) => a.time - b.time);
      const first = filtered[0];
      const last = filtered[filtered.length - 1];
      console.log(`   ↳ first: ${first.time.toISOString()} ${first.type} ${first.amount}`);
      console.log(`   ↳ last : ${last.time.toISOString()} ${last.type} ${last.amount}`);
    } else {
      console.warn(`⚠️  [${debugLabel || 'series'}] no events available for plotting.`);
    }

    // 3) build cumulative change
    const times = [];
    const cumulativeChange = [];
    let acc = 0;
    for (const e of filtered) {
      acc += (e.type === 'unbond' ? -1 : 1) * e.amount;
      times.push(e.time);
      cumulativeChange.push(acc);
    }

    return { times, cumulativeChange, allEvents: filtered };
  }

  _buildAnalysisFromTracker(tracker) {
    // prefer tracker's analyzer if it exists
    if (typeof tracker?.analyzeStakeChanges === 'function') {
      try {
        const a = tracker.analyzeStakeChanges();
        if (
          a &&
          typeof a.totalDelegated === 'number' &&
          typeof a.totalUnbonded === 'number' &&
          typeof a.netChange === 'number'
        ) {
          return {
            totalDelegated: a.totalDelegated,
            totalUnbonded: a.totalUnbonded,
            netChange: a.netChange,
            addressDelegations: a.addressDelegations ?? {},
            addressUnbonds: a.addressUnbonds ?? {},
          };
        }
      } catch (_) {}
    }

    // derive from gathered events
    const { allEvents } = this._buildTimeSeriesFromTracker(tracker, { debugLabel: 'analysis' });
    let totalDelegated = 0;
    let totalUnbonded = 0;
    const addressDelegations = {};
    const addressUnbonds = {};

    for (const e of allEvents) {
      const addr = (e.address ? String(e.address) : 'unknown').slice(0, 64);
      if (e.type === 'delegate') {
        totalDelegated += e.amount;
        addressDelegations[addr] = (addressDelegations[addr] || 0) + e.amount;
      } else {
        totalUnbonded += e.amount;
        addressUnbonds[addr] = (addressUnbonds[addr] || 0) + e.amount;
      }
    }

    return {
      totalDelegated,
      totalUnbonded,
      netChange: totalDelegated - totalUnbonded,
      addressDelegations,
      addressUnbonds,
    };
  }

  // -----------------------
  // Charts
  // -----------------------
  async createStakeAnalysisChart(tracker, outputPath = './validator_analysis.png') {
    if (!this.chartsEnabled) {
      console.log('⚠️  Skipping chart generation - chart dependencies not available');
      return null;
    }

    const validatorId = this._getValidatorId(tracker);
    const months = this._getMonths(tracker);
    const series = this._buildTimeSeriesFromTracker(tracker, { debugLabel: 'stake-analysis' });

    if (!series.times.length) {
      console.warn(`⚠️  No time-series data for validator ${validatorId}; skipping stake analysis chart.`);
      return null;
    }

    const configuration = {
      type: 'line',
      data: {
        labels: series.times.map((t) => format(t, 'MMM dd')),
        datasets: [
          {
            label: 'Cumulative Stake Change (POL)',
            data: series.cumulativeChange,
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            tension: 0.1,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: `Validator ${validatorId} - Cumulative Stake Changes (${months} months)`,
            font: { size: 16 },
          },
          legend: { display: true, position: 'top' },
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: 'POL' },
            ticks: { callback: (v) => Number(v).toLocaleString() },
          },
          x: { title: { display: true, text: 'Date' } },
        },
      },
    };

    const imageBuffer = await this.chartJSNodeCanvas.renderToBuffer(configuration);
    await fs.writeFile(outputPath, imageBuffer);
    console.log(`Chart saved to ${outputPath}`);
    return outputPath;
  }

  async createDelegationVsUnbondingChart(tracker, outputPath = './delegation_vs_unbonding.png') {
    if (!this.chartsEnabled) {
      console.log('⚠️  Skipping chart generation - chart dependencies not available');
      return null;
    }
    const validatorId = this._getValidatorId(tracker);
    const analysis = this._buildAnalysisFromTracker(tracker);

    const configuration = {
      type: 'bar',
      data: {
        labels: ['Delegations', 'Unbonds', 'Net Change'],
        datasets: [
          {
            label: 'POL Amount',
            data: [analysis.totalDelegated, -analysis.totalUnbonded, analysis.netChange],
            backgroundColor: [
              'rgba(54, 162, 235, 0.8)',
              'rgba(255, 99, 132, 0.8)',
              analysis.netChange >= 0 ? 'rgba(75, 192, 192, 0.8)' : 'rgba(255, 159, 64, 0.8)',
            ],
            borderColor: [
              'rgba(54, 162, 235, 1)',
              'rgba(255, 99, 132, 1)',
              analysis.netChange >= 0 ? 'rgba(75, 192, 192, 1)' : 'rgba(255, 159, 64, 1)',
            ],
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: `Validator ${validatorId} - Delegation vs Unbonding Summary`,
            font: { size: 16 },
          },
          legend: { display: false },
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: 'POL' },
            ticks: { callback: (v) => Number(v).toLocaleString() },
          },
        },
      },
    };

    const imageBuffer = await this.chartJSNodeCanvas.renderToBuffer(configuration);
    await fs.writeFile(outputPath, imageBuffer);
    console.log(`Bar chart saved to ${outputPath}`);
    return outputPath;
  }

  async createTopAddressesChart(tracker, outputPath = './top_addresses.png') {
    if (!this.chartsEnabled) {
      console.log('⚠️  Skipping chart generation - chart dependencies not available');
      return null;
    }
    const validatorId = this._getValidatorId(tracker);
    const analysis = this._buildAnalysisFromTracker(tracker);

    const topUnbonders = Object.entries(analysis.addressUnbonds || {})
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    if (topUnbonders.length === 0) {
      console.warn(`⚠️  No unbonding addresses found for validator ${validatorId}; skipping top addresses chart.`);
      return null;
    }

    const configuration = {
      type: 'doughnut',
      data: {
        labels: topUnbonders.map(([address]) => `${String(address).slice(0, 8)}...`),
        datasets: [
          {
            label: 'Unbonded Amount (POL)',
            data: topUnbonders.map(([, amount]) => amount),
            backgroundColor: [
              '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0',
              '#9966FF', '#FF9F40', '#C9CBCF', '#4BC0C0',
              '#7CB342', '#AB47BC'
            ],
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: `Top 10 Unbonding Addresses - Validator ${validatorId}`,
            font: { size: 16 },
          },
          legend: {
            position: 'right',
            labels: {
              generateLabels: function (chart) {
                const data = chart.data;
                if (data.labels.length && data.datasets.length) {
                  return data.labels.map((label, i) => {
                    const amount = data.datasets[0].data[i];
                    return {
                      text: `${label}: ${Number(amount).toLocaleString()} POL`,
                      fillStyle: data.datasets[0].backgroundColor[i],
                      index: i,
                    };
                  });
                }
                return [];
              },
            },
          },
        },
      },
    };

    const imageBuffer = await this.chartJSNodeCanvas.renderToBuffer(configuration);
    await fs.writeFile(outputPath, imageBuffer);
    console.log(`Top addresses chart saved to ${outputPath}`);
    return outputPath;
  }

  async createActivityTimelineChart(tracker, outputPath = './activity_timeline.png') {
    if (!this.chartsEnabled) {
      console.log('⚠️  Skipping chart generation - chart dependencies not available');
      return null;
    }

    const validatorId = this._getValidatorId(tracker);
    const series = this._buildTimeSeriesFromTracker(tracker, { debugLabel: 'activity' });

    if (!series.allEvents.length) {
      console.warn(`⚠️  No events to plot for validator ${validatorId}; skipping activity timeline chart.`);
      return null;
    }

    // Group events by day
    const dailyActivity = {};
    series.allEvents.forEach((event) => {
      const day = format(event.time, 'yyyy-MM-dd');
      if (!dailyActivity[day]) {
        dailyActivity[day] = { unbonds: 0, delegations: 0 };
      }
      dailyActivity[day][event.type === 'unbond' ? 'unbonds' : 'delegations']++;
    });

    const sortedDays = Object.keys(dailyActivity).sort();
    const unbondCounts = sortedDays.map((day) => dailyActivity[day].unbonds);
    const delegationCounts = sortedDays.map((day) => dailyActivity[day].delegations);

    const configuration = {
      type: 'bar',
      data: {
        labels: sortedDays.map((day) => format(new Date(day), 'MMM dd')),
        datasets: [
          {
            label: 'Unbonding Events',
            data: unbondCounts,
            backgroundColor: 'rgba(255, 99, 132, 0.8)',
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 1,
          },
          {
            label: 'Delegation Events',
            data: delegationCounts,
            backgroundColor: 'rgba(54, 162, 235, 0.8)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: `Activity Timeline - Validator ${validatorId}`,
            font: { size: 16 },
          },
          legend: { display: true, position: 'top' },
        },
        scales: {
          x: { stacked: true, title: { display: true, text: 'Date' } },
          y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Number of Events' } },
        },
      },
    };

    const imageBuffer = await this.chartJSNodeCanvas.renderToBuffer(configuration);
    await fs.writeFile(outputPath, imageBuffer);
    console.log(`Activity timeline saved to ${outputPath}`);
    return outputPath;
  }

  async generateAllCharts(tracker, outputDir = './charts') {
    if (!this.chartsEnabled) {
      console.log('⚠️  Skipping all chart generation - chart dependencies not available');
      console.log('   To enable charts, install: npm install chart.js chartjs-node-canvas');
      return [];
    }

    await fs.ensureDir(outputDir);
    console.log('Generating visualization charts...');

    const charts = await Promise.all([
      this.createStakeAnalysisChart(tracker, `${outputDir}/stake_analysis.png`),
      this.createDelegationVsUnbondingChart(tracker, `${outputDir}/delegation_vs_unbonding.png`),
      this.createTopAddressesChart(tracker, `${outputDir}/top_addresses.png`),
      this.createActivityTimelineChart(tracker, `${outputDir}/activity_timeline.png`),
    ]);

    console.log('All charts generated successfully!');
    console.log('====================================================');
    return charts;
  }
}

module.exports = ChartGenerator;
