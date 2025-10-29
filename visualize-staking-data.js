#!/usr/bin/env node

/**
 * Create visual representations of staking and unstaking data
 */

const fs = require('fs-extra');
const path = require('path');

function generateHTMLReport(stakingData, unstakingData) {
    // Process staking data
    const stakingValidators = {};
    stakingData.events.forEach(event => {
        const key = event.validatorName;
        if (!stakingValidators[key]) {
            stakingValidators[key] = { count: 0, amount: 0 };
        }
        stakingValidators[key].count++;
        stakingValidators[key].amount += event.amount;
    });

    const topStakingValidators = Object.entries(stakingValidators)
        .sort((a, b) => b[1].amount - a[1].amount)
        .slice(0, 15);

    // Process unstaking data
    const unstakingValidators = {};
    unstakingData.events.forEach(event => {
        const key = event.validatorName;
        if (!unstakingValidators[key]) {
            unstakingValidators[key] = { count: 0, amount: 0 };
        }
        unstakingValidators[key].count++;
        unstakingValidators[key].amount += event.amount;
    });

    const topUnstakingValidators = Object.entries(unstakingValidators)
        .sort((a, b) => b[1].amount - a[1].amount)
        .slice(0, 15);

    // Get daily breakdown
    const stakingByDate = {};
    stakingData.events.forEach(event => {
        const date = new Date(event.blockNumber * 12 * 1000).toISOString().split('T')[0]; // Approximate
        if (!stakingByDate[date]) {
            stakingByDate[date] = 0;
        }
        stakingByDate[date] += event.amount;
    });

    const unstakingByDate = {};
    unstakingData.events.forEach(event => {
        const date = event.date.split('T')[0];
        if (!unstakingByDate[date]) {
            unstakingByDate[date] = 0;
        }
        unstakingByDate[date] += event.amount;
    });

    // Top addresses
    const stakingAddresses = {};
    stakingData.events.forEach(event => {
        if (!stakingAddresses[event.address]) {
            stakingAddresses[event.address] = 0;
        }
        stakingAddresses[event.address] += event.amount;
    });

    const topStakingAddresses = Object.entries(stakingAddresses)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    const unstakingAddresses = {};
    unstakingData.events.forEach(event => {
        if (!unstakingAddresses[event.address]) {
            unstakingAddresses[event.address] = 0;
        }
        unstakingAddresses[event.address] += event.amount;
    });

    const topUnstakingAddresses = Object.entries(unstakingAddresses)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Polygon Staking/Unstaking Analysis</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            background: #f5f5f5;
            padding: 20px;
            color: #333;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        h1 {
            text-align: center;
            color: #8247e5;
            margin-bottom: 30px;
            font-size: 2.5em;
        }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .summary-card {
            background: white;
            padding: 25px;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .summary-card h3 {
            color: #666;
            font-size: 0.9em;
            text-transform: uppercase;
            margin-bottom: 10px;
        }
        .summary-card .value {
            font-size: 2em;
            font-weight: bold;
            color: #8247e5;
        }
        .summary-card.unstaking .value { color: #e74c3c; }
        .chart-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(600px, 1fr));
            gap: 30px;
            margin-bottom: 30px;
        }
        .chart-container {
            background: white;
            padding: 25px;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .chart-container h2 {
            margin-bottom: 20px;
            color: #333;
            font-size: 1.3em;
        }
        .chart-container.full-width {
            grid-column: 1 / -1;
        }
        canvas { max-height: 400px; }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #eee;
        }
        th {
            background: #f8f9fa;
            font-weight: 600;
            color: #666;
            font-size: 0.9em;
        }
        .address {
            font-family: 'Courier New', monospace;
            font-size: 0.85em;
            color: #666;
        }
        .amount {
            font-weight: 600;
            color: #8247e5;
        }
        .section-title {
            margin: 40px 0 20px;
            font-size: 1.8em;
            color: #333;
            border-bottom: 3px solid #8247e5;
            padding-bottom: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 Polygon Staking/Unstaking Analysis</h1>

        <div class="summary-grid">
            <div class="summary-card">
                <h3>Staking Period</h3>
                <div class="value">${new Date(stakingData.dateRange.start).toLocaleDateString()} - ${new Date(stakingData.dateRange.end).toLocaleDateString()}</div>
            </div>
            <div class="summary-card">
                <h3>Total Staked</h3>
                <div class="value">${(stakingData.totalAmount / 1e6).toFixed(2)}M POL</div>
            </div>
            <div class="summary-card">
                <h3>Staking Events</h3>
                <div class="value">${stakingData.totalEvents.toLocaleString()}</div>
            </div>
            <div class="summary-card">
                <h3>Unique Stakers</h3>
                <div class="value">${stakingData.uniqueAddresses}</div>
            </div>
            <div class="summary-card unstaking">
                <h3>Unstaking Period</h3>
                <div class="value">${new Date(unstakingData.dateRange.start).toLocaleDateString()} - ${new Date(unstakingData.dateRange.end).toLocaleDateString()}</div>
            </div>
            <div class="summary-card unstaking">
                <h3>Total Unstaked</h3>
                <div class="value">${(unstakingData.totalAmount / 1e6).toFixed(2)}M POL</div>
            </div>
            <div class="summary-card unstaking">
                <h3>Unstaking Events</h3>
                <div class="value">${unstakingData.totalEvents.toLocaleString()}</div>
            </div>
            <div class="summary-card unstaking">
                <h3>Unique Unstakers</h3>
                <div class="value">${unstakingData.uniqueAddresses}</div>
            </div>
        </div>

        <h2 class="section-title">🎯 Staking Analysis (June 15-23, 2025)</h2>

        <div class="chart-grid">
            <div class="chart-container">
                <h2>Top 15 Validators by Staking Volume</h2>
                <canvas id="stakingValidatorsChart"></canvas>
            </div>

            <div class="chart-container">
                <h2>Staking Events Distribution</h2>
                <canvas id="stakingEventsChart"></canvas>
            </div>
        </div>

        <div class="chart-container full-width">
            <h2>Top 10 Staking Addresses</h2>
            <table>
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Address</th>
                        <th>Amount Staked</th>
                        <th>% of Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${topStakingAddresses.map(([addr, amount], idx) => `
                        <tr>
                            <td>${idx + 1}</td>
                            <td class="address">${addr}</td>
                            <td class="amount">${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL</td>
                            <td>${((amount / stakingData.totalAmount) * 100).toFixed(2)}%</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <h2 class="section-title">🔻 Unstaking Analysis (June 23 - Aug 1, 2025)</h2>

        <div class="chart-grid">
            <div class="chart-container">
                <h2>Top 15 Validators by Unstaking Volume</h2>
                <canvas id="unstakingValidatorsChart"></canvas>
            </div>

            <div class="chart-container">
                <h2>Unstaking Events Distribution</h2>
                <canvas id="unstakingEventsChart"></canvas>
            </div>
        </div>

        <div class="chart-container full-width">
            <h2>Top 10 Unstaking Addresses</h2>
            <table>
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Address</th>
                        <th>Amount Unstaked</th>
                        <th>% of Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${topUnstakingAddresses.map(([addr, amount], idx) => `
                        <tr>
                            <td>${idx + 1}</td>
                            <td class="address">${addr}</td>
                            <td class="amount">${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL</td>
                            <td>${((amount / unstakingData.totalAmount) * 100).toFixed(2)}%</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div class="chart-container full-width">
            <h2>Staking vs Unstaking Comparison</h2>
            <canvas id="comparisonChart"></canvas>
        </div>
    </div>

    <script>
        Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';

        // Staking Validators Chart
        new Chart(document.getElementById('stakingValidatorsChart'), {
            type: 'bar',
            data: {
                labels: ${JSON.stringify(topStakingValidators.map(v => v[0]))},
                datasets: [{
                    label: 'Total Staked (POL)',
                    data: ${JSON.stringify(topStakingValidators.map(v => v[1].amount))},
                    backgroundColor: 'rgba(130, 71, 229, 0.8)',
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        ticks: {
                            callback: function(value) {
                                return (value / 1e6).toFixed(1) + 'M';
                            }
                        }
                    }
                }
            }
        });

        // Staking Events Chart
        new Chart(document.getElementById('stakingEventsChart'), {
            type: 'pie',
            data: {
                labels: ${JSON.stringify(topStakingValidators.slice(0, 10).map(v => v[0]))},
                datasets: [{
                    data: ${JSON.stringify(topStakingValidators.slice(0, 10).map(v => v[1].count))},
                    backgroundColor: [
                        '#8247e5', '#9b59b6', '#3498db', '#2ecc71', '#f39c12',
                        '#e74c3c', '#1abc9c', '#34495e', '#e67e22', '#95a5a6'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right' }
                }
            }
        });

        // Unstaking Validators Chart
        new Chart(document.getElementById('unstakingValidatorsChart'), {
            type: 'bar',
            data: {
                labels: ${JSON.stringify(topUnstakingValidators.map(v => v[0]))},
                datasets: [{
                    label: 'Total Unstaked (POL)',
                    data: ${JSON.stringify(topUnstakingValidators.map(v => v[1].amount))},
                    backgroundColor: 'rgba(231, 76, 60, 0.8)',
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        ticks: {
                            callback: function(value) {
                                return (value / 1e6).toFixed(1) + 'M';
                            }
                        }
                    }
                }
            }
        });

        // Unstaking Events Chart
        new Chart(document.getElementById('unstakingEventsChart'), {
            type: 'pie',
            data: {
                labels: ${JSON.stringify(topUnstakingValidators.slice(0, 10).map(v => v[0]))},
                datasets: [{
                    data: ${JSON.stringify(topUnstakingValidators.slice(0, 10).map(v => v[1].count))},
                    backgroundColor: [
                        '#e74c3c', '#c0392b', '#e67e22', '#d35400', '#f39c12',
                        '#f1c40f', '#e8a90c', '#d68910', '#c87f0a', '#ba7506'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right' }
                }
            }
        });

        // Comparison Chart
        new Chart(document.getElementById('comparisonChart'), {
            type: 'bar',
            data: {
                labels: ['Total Volume', 'Number of Events', 'Unique Addresses', 'Validators Involved'],
                datasets: [{
                    label: 'Staking',
                    data: [
                        ${stakingData.totalAmount / 1e6},
                        ${stakingData.totalEvents},
                        ${stakingData.uniqueAddresses},
                        ${stakingData.uniqueValidators}
                    ],
                    backgroundColor: 'rgba(130, 71, 229, 0.8)',
                }, {
                    label: 'Unstaking',
                    data: [
                        ${unstakingData.totalAmount / 1e6},
                        ${unstakingData.totalEvents},
                        ${unstakingData.uniqueAddresses},
                        ${unstakingData.uniqueValidators}
                    ],
                    backgroundColor: 'rgba(231, 76, 60, 0.8)',
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' }
                }
            }
        });
    </script>
</body>
</html>
`;

    return html;
}

async function main() {
    console.log('\n' + '='.repeat(80));
    console.log('CREATING VISUAL REPRESENTATION');
    console.log('='.repeat(80) + '\n');

    try {
        const stakingFile = '/Users/ssaagar/Desktop/validator-stake-tracker/stakings_june15_23_2025.json';
        const unstakingFile = '/Users/ssaagar/Desktop/validator-stake-tracker/unstakings_june23_aug1_2025.json';

        console.log('Reading data files...');
        const stakingData = await fs.readJSON(stakingFile);
        const unstakingData = await fs.readJSON(unstakingFile);

        console.log(`Staking events: ${stakingData.totalEvents}`);
        console.log(`Unstaking events: ${unstakingData.totalEvents}\n`);

        console.log('Generating HTML visualization...');
        const html = generateHTMLReport(stakingData, unstakingData);

        const outputFile = '/Users/ssaagar/Desktop/validator-stake-tracker/staking-analysis-report.html';
        await fs.writeFile(outputFile, html);

        console.log('='.repeat(80));
        console.log('✅ VISUALIZATION COMPLETE');
        console.log('='.repeat(80));
        console.log(`\nReport saved to: ${outputFile}`);
        console.log('\nOpen this file in your browser to view the interactive charts!\n');

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}
