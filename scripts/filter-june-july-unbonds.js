#!/usr/bin/env node

/**
 * Filter unstake data for June 1 - July 31, 2025
 * and calculate total unstake amount
 */

const fs = require('fs');
const path = require('path');

// Input and output file paths
const inputFile = process.argv[2] || './biggest_unbonds_all_validators_150d_2025-10-29T02-55-04.json';
const outputFile = './unbonds_june_july_2025.json';

// Date range: June 1, 2025 00:00:00 to July 31, 2025 23:59:59
const startDate = new Date('2025-06-01T00:00:00.000Z');
const endDate = new Date('2025-07-31T23:59:59.999Z');

console.log('\n' + '='.repeat(80));
console.log('FILTERING UNSTAKE DATA: JUNE 1 - JULY 31, 2025');
console.log('='.repeat(80));
console.log(`Input file: ${inputFile}`);
console.log(`Date range: ${startDate.toISOString()} to ${endDate.toISOString()}\n`);

try {
    // Read the JSON file
    const rawData = fs.readFileSync(inputFile, 'utf8');
    const data = JSON.parse(rawData);

    console.log(`Total unbonds in source data: ${data.biggestUnbonds.length}`);
    console.log(`Source data period: ${data.days} days\n`);

    // Filter unbonds within the date range
    const filteredUnbonds = data.biggestUnbonds.filter(unbond => {
        const unbondDate = new Date(unbond.date);
        return unbondDate >= startDate && unbondDate <= endDate;
    });

    console.log(`Unbonds in June-July 2025: ${filteredUnbonds.length}\n`);

    // Calculate statistics
    const totalAmount = filteredUnbonds.reduce((sum, unbond) => sum + unbond.amount, 0);
    const uniqueValidators = new Set(filteredUnbonds.map(u => u.validatorId)).size;
    const uniqueDelegators = new Set(filteredUnbonds.map(u => u.address.toLowerCase())).size;

    // Get validator breakdown
    const validatorBreakdown = {};
    filteredUnbonds.forEach(unbond => {
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

    // Re-rank the filtered unbonds
    const rankedUnbonds = filteredUnbonds
        .sort((a, b) => b.amount - a.amount)
        .map((unbond, index) => ({
            ...unbond,
            rank: index + 1
        }));

    // Create output data
    const outputData = {
        dateRange: {
            start: startDate.toISOString(),
            end: endDate.toISOString()
        },
        generatedAt: new Date().toISOString(),
        sourceFile: inputFile,
        summary: {
            totalUnbonds: filteredUnbonds.length,
            totalAmount: totalAmount,
            uniqueValidators: uniqueValidators,
            uniqueDelegators: uniqueDelegators,
            averageUnbondAmount: filteredUnbonds.length > 0 ? totalAmount / filteredUnbonds.length : 0
        },
        topValidatorsByUnstakeAmount: sortedValidators.map(([name, data]) => ({
            validator: name,
            unbondCount: data.count,
            totalAmount: data.totalAmount,
            percentage: ((data.totalAmount / totalAmount) * 100).toFixed(2) + '%'
        })),
        unbonds: rankedUnbonds
    };

    // Save to file
    fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));

    // Display summary
    console.log('='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Unbonds: ${filteredUnbonds.length.toLocaleString()}`);
    console.log(`Total Unstaked Amount: ${totalAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
    console.log(`Unique Validators: ${uniqueValidators}`);
    console.log(`Unique Delegators: ${uniqueDelegators}`);
    console.log(`Average Unbond: ${(totalAmount / filteredUnbonds.length).toLocaleString('en-US', { maximumFractionDigits: 2 })} POL\n`);

    console.log('='.repeat(80));
    console.log('TOP 10 VALIDATORS BY TOTAL UNSTAKE AMOUNT (JUNE-JULY 2025)');
    console.log('='.repeat(80));
    sortedValidators.forEach(([name, data], index) => {
        console.log(`${(index + 1).toString().padStart(2)}. ${name}`);
        console.log(`    Total Unstaked: ${data.totalAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
        console.log(`    Number of Unbonds: ${data.count}`);
        console.log(`    Percentage of Total: ${((data.totalAmount / totalAmount) * 100).toFixed(2)}%\n`);
    });

    console.log('='.repeat(80));
    console.log('TOP 10 LARGEST UNBONDS (JUNE-JULY 2025)');
    console.log('='.repeat(80));
    rankedUnbonds.slice(0, 10).forEach(unbond => {
        const dateStr = new Date(unbond.date).toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'UTC',
            timeZoneName: 'short'
        });
        console.log(`${unbond.rank}. ${unbond.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
        console.log(`   Validator: ${unbond.validatorName} (ID: ${unbond.validatorId})`);
        console.log(`   Delegator: ${unbond.address}`);
        console.log(`   Date: ${dateStr}`);
        console.log(`   Etherscan: https://etherscan.io/address/${unbond.address}\n`);
    });

    console.log('='.repeat(80));
    console.log(`✅ Filtered data saved to: ${outputFile}`);
    console.log('='.repeat(80) + '\n');

} catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
}
