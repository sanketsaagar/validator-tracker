#!/usr/bin/env node

// Load environment variables from .env file if it exists
require('dotenv').config();

const { program } = require('commander');
const ValidatorTracker = require('./src/ValidatorTracker');
const ChartGenerator = require('./src/ChartGenerator');
const FundFlowTracker = require('./src/FundFlowTracker');

// --- COMPAT SHIM: add getUnbondWalletAddresses() if ValidatorTracker lacks it
if (typeof ValidatorTracker?.prototype?.getUnbondWalletAddresses !== 'function') {
    ValidatorTracker.prototype.getUnbondWalletAddresses = function(minAmount = 0) {
        // Prefer analyzer if present and provides addressUnbonds
        try {
            if (typeof this.analyzeStakeChanges === 'function') {
                const a = this.analyzeStakeChanges();
                if (a && a.addressUnbonds && typeof a.addressUnbonds === 'object') {
                    return Object.entries(a.addressUnbonds)
                        .filter(([, amt]) => Number(amt) >= Number(minAmount))
                        .sort((a, b) => Number(b[1]) - Number(a[1]))
                        .map(([addr]) => String(addr));
                }
            }
        } catch (_) {}

        // Fall back to raw events
        let events = [];
        if (Array.isArray(this.events)) events = this.events;
        else if (Array.isArray(this.stakeEvents)) events = this.stakeEvents;
        else if (Array.isArray(this.activityLog)) events = this.activityLog;
        else if (typeof this.getEvents === 'function') events = this.getEvents() || [];
        else if (typeof this.getStakeEvents === 'function') events = this.getStakeEvents() || [];

        // Respect a months window if available
        const months = Number(this.months ?? this.options?.months ?? this.monthsBack ?? 6);
        const cutoff = Number.isFinite(months) && months > 0
            ? new Date(new Date().setMonth(new Date().getMonth() - months))
            : null;

        const toDate = (t) => (t instanceof Date ? t : new Date(t));
        const unbondTotals = {};
        for (const e of events) {
            if (!e) continue;

            const time = toDate(e.time ?? e.timestamp ?? e.date);
            if (cutoff && !(time > cutoff)) continue;

            const rawType = String(e.type ?? e.kind ?? e.action ?? '').toLowerCase();
            const delta = Number(e.delta ?? e.change);
            const isUnbond =
                rawType.includes('unbond') ||
                rawType.includes('undelegate') ||
                (Number.isFinite(delta) && delta < 0);

            if (!isUnbond) continue;

            const amountRaw = e.amount ?? e.value ?? Math.abs(delta ?? 0);
            const amount = Number(amountRaw);
            if (!Number.isFinite(amount) || amount <= 0) continue;

            const addr = String(e.address ?? e.delegator ?? e.from ?? e.sender ?? 'unknown');
            unbondTotals[addr] = (unbondTotals[addr] || 0) + amount;
        }

        return Object.entries(unbondTotals)
            .filter(([, amt]) => Number(amt) >= Number(minAmount))
            .sort((a, b) => Number(b[1]) - Number(a[1]))
            .map(([addr]) => addr);
    };
}

program
    .name('track-validator')
    .description('Polygon Validator Stake Tracker - Focus on individual delegators with MetaSleuth visualization')
    .version('2.0.0');

program
    .command('analyze')
    .description('Analyze individual delegators for a validator (excludes exchanges/DeFi)')
    .argument('<validator-id>', 'Validator ID to analyze')
    .option('-m, --months <number>', 'Number of months to analyze', '6')
    .option('--no-charts', 'Skip chart generation')
    .option('--no-export', 'Skip data export')
    .option('--include-exchanges', 'Include exchange addresses in analysis')
    .option('--include-defi', 'Include DeFi protocol addresses in analysis')
    .option('--output-dir <path>', 'Output directory for files', './output')
    .action(async (validatorId, options) => {
        try {
            console.log(`Starting individual delegator analysis for Validator ${validatorId}...`);
            
            const tracker = new ValidatorTracker(parseInt(validatorId), parseInt(options.months), {
                filterExchanges: !options.includeExchanges,
                filterDefi: !options.includeDefi,
                filterInstitutional: true
            });
            
            // Run full analysis with filtering
            const analysis = await tracker.runFullAnalysis();
            
            // Generate charts if requested
            if (options.charts) {
                console.log('\nGenerating visualization charts...');
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const chartDir = `${options.outputDir}/charts_${timestamp}`;
                const chartGenerator = new ChartGenerator();
                await chartGenerator.generateAllCharts(tracker, chartDir);
            }
            
            // Display individual delegator addresses for manual MetaSleuth tracking
            const delegatorAddresses = tracker.getIndividualDelegatorAddresses();
            if (delegatorAddresses.length > 0) {
                console.log(`\n📋 INDIVIDUAL DELEGATOR ADDRESSES (${delegatorAddresses.length} total):`);
                console.log('Copy these addresses to MetaSleuth for visual fund flow analysis:');
                delegatorAddresses.slice(0, 20).forEach((address, index) => {
                    console.log(`${(index + 1).toString().padStart(2)}. ${address}`);
                });
                if (delegatorAddresses.length > 20) {
                    console.log(`   ... and ${delegatorAddresses.length - 20} more in the exported data`);
                }
                
                console.log('\n🔗 MetaSleuth Analysis:');
                console.log('1. Go to https://metasleuth.io');
                console.log('2. Enter each address to see visual fund flow graphs');
                console.log('3. Look for connections to exchanges, mixers, or suspicious addresses');
            }
            
            console.log('\n✅ Individual delegator analysis completed!');
            
        } catch (error) {
            console.error(`❌ Error during analysis: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('delegator-tracking')
    .description('Track individual delegators with automatic MetaSleuth visualization')
    .argument('<addresses...>', 'Individual delegator addresses to track (space-separated)')
    .option('-v, --visualizations', 'Generate MetaSleuth visualizations automatically')
    .option('-t, --threshold <number>', 'Minimum POL amount to track', '1')
    .option('-o, --output-prefix <prefix>', 'Output file prefix', 'delegator_tracking')
    .action(async (addresses, options) => {
        try {
            console.log(`🎯 Starting individual delegator tracking for ${addresses.length} addresses...`);
            console.log('🔍 Focusing on individual delegators only (no exchanges/DeFi)');
            
            const flowTracker = new FundFlowTracker();
            
            // Run comprehensive delegator fund flow analysis
            const report = await flowTracker.trackDelegatorFundFlows(addresses, {
                includeVisualizations: options.visualizations,
                amountThreshold: parseFloat(options.threshold),
                outputFilePrefix: options.outputPrefix
            });
            
            console.log('\n✅ Individual delegator tracking completed!');
            
        } catch (error) {
            console.error(`❌ Error during delegator tracking: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('flow-analysis')
    .description('Analyze fund flows from addresses (legacy command)')
    .argument('<addresses...>', 'Addresses to analyze (space-separated)')
    .option('-t, --threshold <number>', 'Minimum POL amount to track', '10')
    .option('-o, --output <file>', 'Output file for detailed report')
    .action(async (addresses, options) => {
        try {
            console.log(`🔍 Starting fund flow analysis for ${addresses.length} addresses...`);
            
            const flowTracker = new FundFlowTracker();
            
            // Generate flow report
            const report = await flowTracker.generateFlowReport(addresses, options.output);
            
            // Print summary
            flowTracker.printFlowSummary(report);
            
            console.log('\n✅ Fund flow analysis completed!');
            
        } catch (error) {
            console.error(`❌ Error during fund flow analysis: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('combined')
    .description('Complete validator analysis focused on individual delegators with MetaSleuth')
    .argument('<validator-id>', 'Validator ID to analyze')
    .option('-m, --months <number>', 'Number of months to analyze', '6')
    .option('-t, --threshold <number>', 'Minimum POL amount to track for flows', '1')
    .option('--output-dir <path>', 'Output directory for files', './output')
    .option('--max-addresses <number>', 'Maximum number of delegator addresses to analyze', '20')
    .option('--with-visualizations', 'Generate MetaSleuth visualizations automatically')
    .option('--include-exchanges', 'Include exchange addresses in analysis')
    .option('--include-defi', 'Include DeFi protocol addresses in analysis')
    .action(async (validatorId, options) => {
        try {
            console.log(`Starting complete individual delegator analysis for Validator ${validatorId}...`);
            
            // Step 1: Validator analysis with filtering
            const tracker = new ValidatorTracker(parseInt(validatorId), parseInt(options.months), {
                filterExchanges: !options.includeExchanges,
                filterDefi: !options.includeDefi,
                filterInstitutional: true
            });
            const analysis = await tracker.runFullAnalysis();
            
            // Step 2: Generate charts with timestamp
            console.log('\nGenerating visualization charts...');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const chartDir = `${options.outputDir}/charts_${timestamp}`;
            const chartGenerator = new ChartGenerator();
            await chartGenerator.generateAllCharts(tracker, chartDir);
            
            // Step 3: Unbond wallet fund flow analysis (now guaranteed to exist via shim)
            const unbondAddresses = tracker.getUnbondWalletAddresses();
            
            if (unbondAddresses.length > 0) {
                console.log(`\nStarting fund flow analysis for ${unbondAddresses.length} unbond wallets...`);
                console.log(`Focusing on addresses that have unbonded POL tokens`);
                
                // Limit to max addresses to avoid overwhelming the APIs
                const addressesToAnalyze = unbondAddresses.slice(0, parseInt(options.maxAddresses));
                
                if (addressesToAnalyze.length < unbondAddresses.length) {
                    console.log(`Analyzing ${addressesToAnalyze.length} addresses (out of ${unbondAddresses.length} total unbond wallets)`);
                }
                
                const flowTracker = new FundFlowTracker();
                const unbondReport = await flowTracker.trackDelegatorFundFlows(addressesToAnalyze, {
                    includeVisualizations: options.withVisualizations,
                    amountThreshold: parseFloat(options.threshold),
                    outputFilePrefix: `${options.outputDir}/unbond_analysis`
                });
                
                console.log('\nUNBOND WALLET ADDRESSES FOR FUND FLOW ANALYSIS:');
                console.log('These addresses have unbonded POL and are being tracked:');
                addressesToAnalyze.slice(0, 10).forEach((address, index) => {
                    console.log(`${(index + 1).toString().padStart(2)}. ${address}`);
                });
                
                if (addressesToAnalyze.length > 10) {
                    console.log(`... and ${addressesToAnalyze.length - 10} more in the analysis files`);
                }
                
            } else {
                console.log('\nNo unbond wallets found for fund flow analysis');
            }
            
            console.log('\nComplete unbond wallet analysis completed!');
            console.log(`Check ${options.outputDir} directory for all generated files`);
            console.log(`Charts saved to: ${chartDir}`);
            console.log('\nNext Steps:');
            console.log('1. Review the unbond wallet addresses above');
            console.log('2. Use Arkham Intelligence URLs for visual fund flow analysis');
            console.log('3. Look for suspicious patterns or connections to exchanges/mixers');
            
        } catch (error) {
            console.error(`❌ Error during combined analysis: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('biggest-unbonds')
    .description('Find the biggest unstaking transactions across ALL validators or a specific validator')
    .argument('[validator-id]', 'Validator ID to analyze (optional - leave empty to check ALL validators)')
    .option('-d, --days <number>', 'Number of days to look back (default: 7 for 1 week)', '7')
    .option('-t, --top <number>', 'Number of top transactions to show', '10')
    .option('-m, --months <number>', 'Number of months to fetch data (only for specific validator)', '1')
    .option('--export', 'Export results to JSON file')
    .action(async (validatorId, options) => {
        try {
            const days = parseInt(options.days);
            const top = parseInt(options.top);

            // Check ALL validators if no validator ID provided
            if (!validatorId) {
                console.log(`\n${'='.repeat(80)}`);
                console.log(`SEARCHING ACROSS ALL POLYGON VALIDATORS`);
                console.log(`${'='.repeat(80)}`);
                console.log(`Time period: Last ${days} day(s)`);
                console.log(`Looking for top ${top} transactions\n`);
                console.log('⏳ This may take a few minutes as we check all validators...\n');

                // Fetch unbonds from all validators
                const biggestUnbonds = await ValidatorTracker.fetchAllUnbondsAcrossValidators(days, top);

                if (biggestUnbonds.length === 0) {
                    console.log(`\n❌ No unstaking transactions found in the last ${days} day(s) across all validators`);
                    return;
                }

                // Display results
                console.log(`\n${'='.repeat(80)}`);
                console.log(`TOP ${biggestUnbonds.length} BIGGEST UNSTAKING TRANSACTIONS (Last ${days} days)`);
                console.log(`ACROSS ALL VALIDATORS`);
                console.log(`${'='.repeat(80)}\n`);

                biggestUnbonds.forEach((unbond) => {
                    const dateStr = unbond.date.toLocaleString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });

                    console.log(`${unbond.rank}. ${unbond.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
                    console.log(`   Validator: ${unbond.validatorName} (ID: ${unbond.validatorId})`);
                    console.log(`   Delegator Address: ${unbond.address}`);
                    console.log(`   Date: ${dateStr}`);
                    console.log(`   Etherscan: https://etherscan.io/address/${unbond.address}`);
                    console.log(`   Polygonscan: https://polygonscan.com/address/${unbond.address}`);
                    console.log('');
                });

                // Summary statistics
                const totalAmount = biggestUnbonds.reduce((sum, u) => sum + u.amount, 0);
                const uniqueValidators = new Set(biggestUnbonds.map(u => u.validatorId)).size;
                const uniqueDelegators = new Set(biggestUnbonds.map(u => u.address.toLowerCase())).size;
                const averageAmount = biggestUnbonds.length > 0 ? totalAmount / biggestUnbonds.length : 0;

                // Get validator breakdown
                const validatorBreakdown = {};
                biggestUnbonds.forEach(unbond => {
                    const key = `${unbond.validatorName} (ID: ${unbond.validatorId})`;
                    if (!validatorBreakdown[key]) {
                        validatorBreakdown[key] = {
                            count: 0,
                            totalAmount: 0
                        };
                    }
                    validatorBreakdown[key].count++;
                    validatorBreakdown[key].totalAmount += unbond.amount;
                });

                // Sort validators by total amount
                const sortedValidators = Object.entries(validatorBreakdown)
                    .sort((a, b) => b[1].totalAmount - a[1].totalAmount)
                    .slice(0, 10); // Top 10 validators

                console.log(`${'='.repeat(80)}`);
                console.log(`SUMMARY`);
                console.log(`${'='.repeat(80)}`);
                console.log(`Total Unbonds: ${biggestUnbonds.length.toLocaleString()}`);
                console.log(`Total Unstaked Amount: ${totalAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
                console.log(`Unique Validators: ${uniqueValidators}`);
                console.log(`Unique Delegators: ${uniqueDelegators}`);
                console.log(`Average Unbond: ${averageAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL\n`);

                console.log(`${'='.repeat(80)}`);
                console.log(`TOP 10 VALIDATORS BY TOTAL UNSTAKE AMOUNT`);
                console.log(`${'='.repeat(80)}`);
                sortedValidators.forEach(([name, data], index) => {
                    console.log(`${(index + 1).toString().padStart(2)}. ${name}`);
                    console.log(`    Total Unstaked: ${data.totalAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
                    console.log(`    Number of Unbonds: ${data.count}`);
                    console.log(`    Percentage of Total: ${((data.totalAmount / totalAmount) * 100).toFixed(2)}%\n`);
                });

                // Export if requested
                if (options.export) {
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                    const filename = `biggest_unbonds_all_validators_${days}d_${timestamp}.json`;
                    const fs = require('fs-extra');
                    await fs.writeJSON(filename, {
                        scope: 'all_validators',
                        days,
                        generatedAt: new Date().toISOString(),
                        biggestUnbonds,
                        summary: {
                            totalUnbonds: biggestUnbonds.length,
                            totalAmount,
                            uniqueValidators,
                            uniqueDelegators,
                            averageUnbondAmount: averageAmount
                        },
                        topValidatorsByUnstakeAmount: sortedValidators.map(([name, data]) => ({
                            validator: name,
                            unbondCount: data.count,
                            totalAmount: data.totalAmount,
                            percentage: ((data.totalAmount / totalAmount) * 100).toFixed(2) + '%'
                        }))
                    }, { spaces: 2 });
                    console.log(`\n📄 Results exported to: ${filename}`);
                }

                console.log('\n✅ Analysis completed!');

            } else {
                // Analyze specific validator
                console.log(`\nFinding biggest unstaking transactions for Validator ${validatorId}...`);
                console.log(`Time period: Last ${days} day(s)`);
                console.log(`Fetching data from last ${options.months} month(s)\n`);

                // Create tracker and fetch data
                const tracker = new ValidatorTracker(parseInt(validatorId), parseInt(options.months));

                await tracker.fetchValidatorInfo();
                await tracker.fetchUnbonds();

                // Get biggest unbonds
                const biggestUnbonds = tracker.getBiggestUnbonds(days, top);

                if (biggestUnbonds.length === 0) {
                    console.log(`\nNo unstaking transactions found in the last ${days} day(s)`);
                    console.log(`Total unbond events in ${options.months} month(s): ${tracker.unbondData.length}`);
                    return;
                }

                // Display results
                console.log(`\n${'='.repeat(80)}`);
                console.log(`TOP ${biggestUnbonds.length} BIGGEST UNSTAKING TRANSACTIONS (Last ${days} days)`);
                console.log(`${'='.repeat(80)}\n`);

                biggestUnbonds.forEach((unbond) => {
                    const dateStr = unbond.date.toLocaleString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });

                    console.log(`${unbond.rank}. ${unbond.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
                    console.log(`   Address: ${unbond.address}`);
                    console.log(`   Date: ${dateStr}`);
                    console.log(`   Etherscan: https://etherscan.io/address/${unbond.address}`);
                    console.log(`   Polygonscan: https://polygonscan.com/address/${unbond.address}`);
                    console.log('');
                });

                // Summary statistics
                const totalAmount = biggestUnbonds.reduce((sum, u) => sum + u.amount, 0);
                const allUnbondsInPeriod = tracker.unbondData.filter(e => {
                    const cutoffDate = new Date();
                    cutoffDate.setDate(cutoffDate.getDate() - days);
                    return e.parsedTime >= cutoffDate;
                });

                console.log(`${'='.repeat(80)}`);
                console.log(`SUMMARY`);
                console.log(`${'='.repeat(80)}`);
                console.log(`Total in top ${biggestUnbonds.length}: ${totalAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
                console.log(`Total unbond events in period: ${allUnbondsInPeriod.length}`);
                if (allUnbondsInPeriod.length > 0) {
                    console.log(`Average unbond size in period: ${(allUnbondsInPeriod.reduce((sum, e) => sum + e.amountPol, 0) / allUnbondsInPeriod.length).toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
                }

                // Export if requested
                if (options.export) {
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                    const filename = `biggest_unbonds_v${validatorId}_${days}d_${timestamp}.json`;
                    const fs = require('fs-extra');
                    await fs.writeJSON(filename, {
                        validatorId: parseInt(validatorId),
                        days,
                        generatedAt: new Date().toISOString(),
                        biggestUnbonds,
                        summary: {
                            totalAmount,
                            totalEvents: allUnbondsInPeriod.length,
                            averageSize: allUnbondsInPeriod.length > 0 ? allUnbondsInPeriod.reduce((sum, e) => sum + e.amountPol, 0) / allUnbondsInPeriod.length : 0
                        }
                    }, { spaces: 2 });
                    console.log(`\n📄 Results exported to: ${filename}`);
                }

                console.log('\n✅ Analysis completed!');
            }

        } catch (error) {
            console.error(`❌ Error during analysis: ${error.message}`);
            console.error(error.stack);
            process.exit(1);
        }
    });

program
    .command('biggest-delegators')
    .description('Find the top delegators (stakers) across ALL validators with current stake amounts')
    .option('-m, --months <number>', 'Number of months to look back for calculating net stake (default: 6)', '6')
    .option('-t, --top <number>', 'Number of top delegators to show', '100')
    .option('--export', 'Export results to JSON file')
    .action(async (options) => {
        try {
            const months = parseInt(options.months);
            const top = parseInt(options.top);

            console.log(`\n${'='.repeat(80)}`);
            console.log(`FINDING TOP ${top} DELEGATORS ACROSS ALL POLYGON VALIDATORS`);
            console.log(`${'='.repeat(80)}`);
            console.log(`Time period: Last ${months} month(s)`);
            console.log(`\n⚠️  NOTE: This command queries Ethereum for delegation events.`);
            console.log(`   It may take 10-20 minutes to complete depending on the time period.\n`);

            // Fetch top delegators
            const topDelegators = await ValidatorTracker.fetchAllDelegatorsAcrossValidators(months, top);

            if (topDelegators.length === 0) {
                console.log(`\n❌ No delegators found or error occurred during fetch`);
                return;
            }

            // Display results
            console.log(`\n${'='.repeat(80)}`);
            console.log(`TOP ${topDelegators.length} DELEGATORS BY NET STAKE (Last ${months} months)`);
            console.log(`${'='.repeat(80)}\n`);

            topDelegators.forEach((delegator) => {
                console.log(`${delegator.rank}. ${delegator.address}`);
                console.log(`   Net Stake: ${delegator.netStake.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
                console.log(`   Total Delegated: ${delegator.totalDelegated.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
                console.log(`   Total Unbonded: ${delegator.totalUnbonded.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
                console.log(`   Staking with ${delegator.validatorDetails.length} validator(s):`);

                // Show top 3 validators for this delegator
                delegator.validatorDetails.slice(0, 3).forEach((val, idx) => {
                    console.log(`     ${idx + 1}. ${val.validatorName} (ID: ${val.validatorId}) - ${val.netStake.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
                });

                if (delegator.validatorDetails.length > 3) {
                    console.log(`     ... and ${delegator.validatorDetails.length - 3} more validator(s)`);
                }

                console.log(`   Etherscan: https://etherscan.io/address/${delegator.address}`);
                console.log('');
            });

            // Summary statistics
            const totalNetStake = topDelegators.reduce((sum, d) => sum + d.netStake, 0);
            const totalDelegated = topDelegators.reduce((sum, d) => sum + d.totalDelegated, 0);
            const totalUnbonded = topDelegators.reduce((sum, d) => sum + d.totalUnbonded, 0);
            const avgNetStake = topDelegators.length > 0 ? totalNetStake / topDelegators.length : 0;

            // Get validator distribution
            const validatorCounts = {};
            topDelegators.forEach(d => {
                d.validatorDetails.forEach(v => {
                    const key = `${v.validatorName} (ID: ${v.validatorId})`;
                    if (!validatorCounts[key]) {
                        validatorCounts[key] = {
                            count: 0,
                            totalStake: 0
                        };
                    }
                    validatorCounts[key].count++;
                    validatorCounts[key].totalStake += v.netStake;
                });
            });

            // Sort validators by total stake
            const topValidators = Object.entries(validatorCounts)
                .sort((a, b) => b[1].totalStake - a[1].totalStake)
                .slice(0, 10);

            console.log(`${'='.repeat(80)}`);
            console.log(`SUMMARY`);
            console.log(`${'='.repeat(80)}`);
            console.log(`Total Delegators: ${topDelegators.length.toLocaleString()}`);
            console.log(`Total Net Stake: ${totalNetStake.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
            console.log(`Total Delegated: ${totalDelegated.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
            console.log(`Total Unbonded: ${totalUnbonded.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
            console.log(`Average Net Stake: ${avgNetStake.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL\n`);

            console.log(`${'='.repeat(80)}`);
            console.log(`TOP 10 VALIDATORS BY STAKE FROM TOP DELEGATORS`);
            console.log(`${'='.repeat(80)}`);
            topValidators.forEach(([name, data], index) => {
                console.log(`${(index + 1).toString().padStart(2)}. ${name}`);
                console.log(`    Total Stake from Top Delegators: ${data.totalStake.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
                console.log(`    Number of Top Delegators: ${data.count}`);
                console.log(`    Percentage of Total: ${((data.totalStake / totalNetStake) * 100).toFixed(2)}%\n`);
            });

            // Export if requested
            if (options.export) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const filename = `biggest_delegators_${months}m_${timestamp}.json`;
                const fs = require('fs-extra');
                await fs.writeJSON(filename, {
                    months,
                    generatedAt: new Date().toISOString(),
                    topDelegators,
                    summary: {
                        totalDelegators: topDelegators.length,
                        totalNetStake,
                        totalDelegated,
                        totalUnbonded,
                        averageNetStake: avgNetStake
                    },
                    topValidatorsByStake: topValidators.map(([name, data]) => ({
                        validator: name,
                        delegatorCount: data.count,
                        totalStake: data.totalStake,
                        percentage: ((data.totalStake / totalNetStake) * 100).toFixed(2) + '%'
                    }))
                }, { spaces: 2 });
                console.log(`\n📄 Results exported to: ${filename}`);
            }

            console.log('\n✅ Analysis completed!');

        } catch (error) {
            console.error(`❌ Error during analysis: ${error.message}`);
            console.error(error.stack);
            process.exit(1);
        }
    });

program
    .command('new-delegations')
    .description('Find new delegators who staked in the last X hours')
    .option('-h, --hours <number>', 'Number of hours to look back (default: 48 hours)', '48')
    .option('-t, --top <number>', 'Number of top delegations to show', '50')
    .option('--export', 'Export results to JSON file')
    .action(async (options) => {
        try {
            const hours = parseInt(options.hours);
            const top = parseInt(options.top);

            console.log(`\n${'='.repeat(80)}`);
            console.log(`FINDING NEW DELEGATIONS IN THE LAST ${hours} HOURS`);
            console.log(`${'='.repeat(80)}`);
            console.log(`Searching across ALL Polygon validators`);
            console.log(`⏳ Querying Ethereum mainnet for ShareMinted events...\n`);

            // Fetch recent delegations
            const recentDelegations = await ValidatorTracker.fetchRecentDelegations(hours, top);

            if (recentDelegations.length === 0) {
                console.log(`\n❌ No new delegations found in the last ${hours} hours`);
                console.log(`\nNote: Delegations happen on Ethereum mainnet. Make sure ETHERSCAN_API_KEY is set.`);
                return;
            }

            // Display results
            console.log(`\n${'='.repeat(80)}`);
            console.log(`${recentDelegations.length} NEW DELEGATIONS (Last ${hours} hours)`);
            console.log(`ACROSS ALL VALIDATORS`);
            console.log(`${'='.repeat(80)}\n`);

            recentDelegations.forEach((delegation) => {
                const dateStr = delegation.date.toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'UTC',
                    timeZoneName: 'short'
                });

                console.log(`${delegation.rank}. ${delegation.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
                console.log(`   Validator: ${delegation.validatorName} (ID: ${delegation.validatorId})`);
                console.log(`   Delegator Address: ${delegation.address}`);
                console.log(`   Date: ${dateStr}`);
                console.log(`   Etherscan TX: https://etherscan.io/tx/${delegation.transactionHash}`);
                console.log(`   Address Info: https://etherscan.io/address/${delegation.address}`);
                console.log('');
            });

            // Summary statistics
            const totalAmount = recentDelegations.reduce((sum, d) => sum + d.amount, 0);
            const uniqueValidators = new Set(recentDelegations.map(d => d.validatorId)).size;
            const uniqueDelegators = new Set(recentDelegations.map(d => d.address.toLowerCase())).size;
            const averageAmount = recentDelegations.length > 0 ? totalAmount / recentDelegations.length : 0;

            // Get validator breakdown
            const validatorBreakdown = {};
            recentDelegations.forEach(delegation => {
                const key = `${delegation.validatorName} (ID: ${delegation.validatorId})`;
                if (!validatorBreakdown[key]) {
                    validatorBreakdown[key] = {
                        count: 0,
                        totalAmount: 0
                    };
                }
                validatorBreakdown[key].count++;
                validatorBreakdown[key].totalAmount += delegation.amount;
            });

            // Sort validators by total amount
            const sortedValidators = Object.entries(validatorBreakdown)
                .sort((a, b) => b[1].totalAmount - a[1].totalAmount)
                .slice(0, 10); // Top 10 validators

            console.log(`${'='.repeat(80)}`);
            console.log(`SUMMARY`);
            console.log(`${'='.repeat(80)}`);
            console.log(`Total New Delegations: ${recentDelegations.length.toLocaleString()}`);
            console.log(`Total Amount Delegated: ${totalAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
            console.log(`Unique Validators: ${uniqueValidators}`);
            console.log(`Unique Delegators: ${uniqueDelegators}`);
            console.log(`Average Delegation: ${averageAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL\n`);

            console.log(`${'='.repeat(80)}`);
            console.log(`TOP VALIDATORS BY NEW DELEGATION AMOUNT`);
            console.log(`${'='.repeat(80)}`);
            sortedValidators.forEach(([name, data], index) => {
                console.log(`${(index + 1).toString().padStart(2)}. ${name}`);
                console.log(`    Total Delegated: ${data.totalAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
                console.log(`    Number of Delegations: ${data.count}`);
                console.log(`    Percentage of Total: ${((data.totalAmount / totalAmount) * 100).toFixed(2)}%\n`);
            });

            // Export if requested
            if (options.export) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const filename = `new_delegations_${hours}h_${timestamp}.json`;
                const fs = require('fs-extra');
                await fs.writeJSON(filename, {
                    hours,
                    generatedAt: new Date().toISOString(),
                    newDelegations: recentDelegations,
                    summary: {
                        totalDelegations: recentDelegations.length,
                        totalAmount,
                        uniqueValidators,
                        uniqueDelegators,
                        averageDelegation: averageAmount
                    },
                    topValidatorsByDelegation: sortedValidators.map(([name, data]) => ({
                        validator: name,
                        delegationCount: data.count,
                        totalAmount: data.totalAmount,
                        percentage: ((data.totalAmount / totalAmount) * 100).toFixed(2) + '%'
                    }))
                }, { spaces: 2 });
                console.log(`\n📄 Results exported to: ${filename}`);
            }

            console.log('\n✅ Analysis completed!');
            console.log('\n💡 TIP: Use these delegator addresses with the "delegator-tracking" command');
            console.log('   to analyze their fund flows and staking behavior.');

        } catch (error) {
            console.error(`❌ Error fetching new delegations: ${error.message}`);
            console.error(error.stack);
            process.exit(1);
        }
    });

program
    .command('setup')
    .description('Setup environment and install dependencies')
    .action(async () => {
        console.log('🔧 Setting up Individual Delegator Stake Tracker...');
        console.log('\n Environment Variables needed:');
        console.log('  ETHERSCAN_API_KEY - Get from https://etherscan.io/apis (REQUIRED for delegation data)');
        console.log('  POLYGONSCAN_API_KEY - Get from https://polygonscan.com/apis (for unbond data)');
        console.log('  ARKHAM_API_KEY - Get from https://arkhamintelligence.com/api (RECOMMENDED for fund flow)');
        console.log('');
        console.log('⚡ IMPORTANT: Delegation tracking requires ETHERSCAN_API_KEY because');
        console.log('   delegation happens on Ethereum mainnet via buyVoucher transactions!');
        console.log('');
        console.log(' Fund Flow Analysis Options:');
        console.log('  • Arkham Intelligence - Best free visual fund flow analysis');
        console.log('  • Dune Analytics - Free SQL-based blockchain analytics');
        console.log('  • Etherscan - Basic transaction history and analysis');
        
        console.log('\n Make sure to install dependencies:');
        console.log('  npm install');
        
        console.log('\n Key Features:');
        console.log('  • Focus on individual delegators only (excludes exchanges/DeFi)');
        console.log('  • Fund flow analysis for unbond wallets using Arkham Intelligence');
        console.log('  • Enhanced filtering and classification of addresses');
        
        console.log('\n Example usage:');
        console.log('  # Analyze individual delegators for validator 27');
        console.log('  npx track-validator analyze 27');
        console.log('');
        console.log('  # Complete analysis with fund flow visualizations');
        console.log('  npx track-validator combined 27 --with-visualizations');
        console.log('');
        console.log('  # Track specific delegator addresses');
        console.log('  npx track-validator delegator-tracking 0x123... 0x456... --visualizations');
        console.log('');
        console.log('  # Include exchanges in analysis (not recommended)');
        console.log('  npx track-validator analyze 27 --include-exchanges');
        
        console.log('\n Fund Flow Analysis:');
        console.log('  • Get visual fund flow graphs via Arkham Intelligence');
        console.log('  • See connections to exchanges, mixers, DeFi protocols');
        console.log('  • Identify suspicious transaction patterns');
        console.log('  • Enhanced address labeling and risk scoring');
        
        console.log('\n✅ Setup information displayed!');
    });

// Handle unmatched commands
program.on('command:*', () => {
    console.error('❌ Invalid command: %s\nSee --help for a list of available commands.', program.args.join(' '));
    process.exit(1);
});

// Show help if no command provided
if (!process.argv.slice(2).length) {
    program.outputHelp();
}

program.parse();
