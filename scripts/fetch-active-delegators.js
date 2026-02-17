#!/usr/bin/env node

/**
 * Fetch TOP 100 ACTIVE DELEGATORS with simplified output
 * Shows: Address, Current Stake, Validators they're staking with
 */

const axios = require('axios');
const { subMonths } = require('date-fns');
const fs = require('fs-extra');

// Configuration
const STAKING_MANAGER_CONTRACT = '0xa59c847bd5ac0172ff4fe912c5d29e5a71a7512b';
const SHARE_MINTED_TOPIC = '0xc9afff0972d33d68c8d330fe0ebd0e9f54491ad8c59ae17330a9206f280f0865';

// Public RPC endpoints
const PUBLIC_RPC_ENDPOINTS = [
    'https://eth.llamarpc.com',
    'https://rpc.ankr.com/eth',
    'https://ethereum.publicnode.com',
    'https://eth.drpc.org',
    'https://1rpc.io/eth'
];

class ActiveDelegatorsFetcher {
    constructor() {
        this.rpcEndpoint = PUBLIC_RPC_ENDPOINTS[0];
        this.requestDelay = 500;
        this.batchSize = 5000;
    }

    async rpcCall(method, params, retryCount = 0) {
        try {
            const response = await axios.post(this.rpcEndpoint, {
                jsonrpc: '2.0',
                id: 1,
                method: method,
                params: params
            }, {
                timeout: 30000,
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.data.error) {
                throw new Error(response.data.error.message || JSON.stringify(response.data.error));
            }

            return response.data.result;
        } catch (error) {
            if (retryCount < PUBLIC_RPC_ENDPOINTS.length - 1) {
                console.warn(`⚠️  RPC error, trying next endpoint...`);
                this.rpcEndpoint = PUBLIC_RPC_ENDPOINTS[retryCount + 1];
                await new Promise(resolve => setTimeout(resolve, 1000));
                return this.rpcCall(method, params, retryCount + 1);
            }
            throw error;
        }
    }

    async getCurrentBlock() {
        const blockHex = await this.rpcCall('eth_blockNumber', []);
        return parseInt(blockHex, 16);
    }

    async getBlock(blockNumber) {
        const blockHex = '0x' + blockNumber.toString(16);
        const block = await this.rpcCall('eth_getBlockByNumber', [blockHex, false]);
        return block;
    }

    async getBlockFromTimestamp(targetTimestamp) {
        console.log(`Estimating block for ${new Date(targetTimestamp * 1000).toDateString()}...`);
        const currentBlock = await this.getCurrentBlock();
        const currentBlockData = await this.getBlock(currentBlock);
        const currentTimestamp = parseInt(currentBlockData.timestamp, 16);

        if (targetTimestamp >= currentTimestamp) {
            return currentBlock;
        }

        const timeDiff = currentTimestamp - targetTimestamp;
        const estimatedBlockDiff = Math.floor(timeDiff / 12);
        const estimatedBlock = Math.max(1, currentBlock - estimatedBlockDiff);
        console.log(`Starting from block: ${estimatedBlock.toLocaleString()}`);
        return estimatedBlock;
    }

    async fetchLogs(fromBlock, toBlock) {
        const allLogs = [];
        let currentFrom = fromBlock;
        let batchCount = 0;

        while (currentFrom <= toBlock) {
            const currentTo = Math.min(currentFrom + this.batchSize - 1, toBlock);
            batchCount++;

            if (batchCount % 10 === 0) {
                console.log(`  Processed ${batchCount} batches, found ${allLogs.length} events so far...`);
            }

            try {
                const logs = await this.rpcCall('eth_getLogs', [{
                    address: STAKING_MANAGER_CONTRACT,
                    topics: [SHARE_MINTED_TOPIC],
                    fromBlock: '0x' + currentFrom.toString(16),
                    toBlock: '0x' + currentTo.toString(16)
                }]);

                allLogs.push(...logs);
                await new Promise(resolve => setTimeout(resolve, this.requestDelay));

            } catch (error) {
                if (error.message.includes('query returned more than') || error.message.includes('exceed maximum')) {
                    console.warn(`    Batch too large, splitting...`);
                    const halfBatch = Math.floor((currentTo - currentFrom + 1) / 2);
                    const firstHalf = await this.fetchLogs(currentFrom, currentFrom + halfBatch - 1);
                    const secondHalf = await this.fetchLogs(currentFrom + halfBatch, currentTo);
                    allLogs.push(...firstHalf, ...secondHalf);
                } else {
                    throw error;
                }
            }

            currentFrom = currentTo + 1;
        }

        return allLogs;
    }

    parseShareMintedEvent(log) {
        const validatorId = parseInt(log.topics[1], 16);
        const userAddress = '0x' + log.topics[2].slice(26).toLowerCase();
        const dataWithoutPrefix = log.data.slice(2);
        const amountHex = '0x' + dataWithoutPrefix.slice(0, 64);
        const amount = BigInt(amountHex);
        const amountPol = Number(amount) / 1e18;

        return {
            validatorId,
            userAddress,
            amount: amountPol,
            transactionHash: log.transactionHash
        };
    }

    fromWeiToPol(weiString) {
        const s = String(weiString).replace(/^0+/, '') || '0';
        const len = s.length;
        if (len <= 18) {
            return Number(`0.${'0'.repeat(18 - len)}${s}`);
        }
        const whole = s.slice(0, len - 18);
        const frac = s.slice(len - 18).replace(/0+$/, '');
        return Number(frac ? `${whole}.${frac}` : whole);
    }
}

async function main() {
    const args = process.argv.slice(2);
    const monthsBack = args[0] ? parseInt(args[0]) : 5;
    const topCount = args[1] ? parseInt(args[1]) : 100;

    console.log('\n' + '='.repeat(80));
    console.log('FETCHING TOP 100 ACTIVE DELEGATORS');
    console.log('='.repeat(80));
    console.log(`Time period: Last ${monthsBack} month(s)`);
    console.log(`Top count: ${topCount}`);
    console.log('');

    const fetcher = new ActiveDelegatorsFetcher();

    try {
        const cutoffDate = subMonths(new Date(), monthsBack);
        const cutoffTimestamp = Math.floor(cutoffDate.getTime() / 1000);

        console.log(`Fetching delegations from ${cutoffDate.toDateString()} to today...\n`);

        const fromBlock = await fetcher.getBlockFromTimestamp(cutoffTimestamp);
        const toBlock = await fetcher.getCurrentBlock();
        console.log(`Total blocks: ${(toBlock - fromBlock).toLocaleString()}\n`);

        console.log('Fetching delegation events from Ethereum...');
        const logs = await fetcher.fetchLogs(fromBlock, toBlock);
        console.log(`\n✅ Found ${logs.length} delegation events\n`);

        console.log('Fetching validator names...');
        const validatorsResponse = await axios.get('https://staking-api.polygon.technology/api/v2/validators');
        const validators = validatorsResponse.data.result || [];
        const validatorMap = {};
        validators.forEach(v => {
            validatorMap[v.id] = v.name || `Validator ${v.id}`;
        });

        console.log('Processing delegation events...');
        const delegations = [];
        logs.forEach(log => {
            try {
                const event = fetcher.parseShareMintedEvent(log);
                delegations.push({
                    validatorId: event.validatorId,
                    validatorName: validatorMap[event.validatorId] || `Validator ${event.validatorId}`,
                    address: event.userAddress,
                    amount: event.amount
                });
            } catch (err) {
                // Skip invalid events
            }
        });

        console.log('Fetching unbond events...');
        const allUnbonds = [];
        let processedCount = 0;
        for (const validator of validators) {
            processedCount++;
            if (processedCount % 10 === 0) {
                console.log(`  Progress: ${processedCount}/${validators.length} validators...`);
            }

            try {
                const unbondsUrl = `https://staking-api.polygon.technology/api/v2/validators/unbonds/${validator.id}`;
                const unbondsResponse = await axios.get(unbondsUrl);
                const unbondEvents = unbondsResponse.data.result || [];

                unbondEvents.forEach(event => {
                    try {
                        const timestamp = parseInt(event.unbondStartedTimeStamp);
                        const eventTime = new Date(timestamp * 1000);
                        if (eventTime >= cutoffDate) {
                            const amountPol = fetcher.fromWeiToPol(String(event.amount));
                            allUnbonds.push({
                                validatorId: validator.id,
                                validatorName: validator.name || `Validator ${validator.id}`,
                                address: event.user.toLowerCase(),
                                amount: amountPol
                            });
                        }
                    } catch (err) {
                        // Skip
                    }
                });

                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (err) {
                // Skip
            }
        }

        console.log(`\nFound ${allUnbonds.length} unbond events\n`);

        console.log('Calculating active stakes...');
        const addressStakes = {};

        delegations.forEach(event => {
            const key = event.address;
            if (!addressStakes[key]) {
                addressStakes[key] = {
                    address: key,
                    totalDelegated: 0,
                    totalUnbonded: 0,
                    validators: {}
                };
            }
            addressStakes[key].totalDelegated += event.amount;

            if (!addressStakes[key].validators[event.validatorId]) {
                addressStakes[key].validators[event.validatorId] = {
                    validatorId: event.validatorId,
                    validatorName: event.validatorName,
                    delegated: 0,
                    unbonded: 0,
                    currentStake: 0
                };
            }
            addressStakes[key].validators[event.validatorId].delegated += event.amount;
        });

        allUnbonds.forEach(event => {
            const key = event.address;
            if (!addressStakes[key]) {
                addressStakes[key] = {
                    address: key,
                    totalDelegated: 0,
                    totalUnbonded: 0,
                    validators: {}
                };
            }
            addressStakes[key].totalUnbonded += event.amount;

            if (!addressStakes[key].validators[event.validatorId]) {
                addressStakes[key].validators[event.validatorId] = {
                    validatorId: event.validatorId,
                    validatorName: event.validatorName,
                    delegated: 0,
                    unbonded: 0,
                    currentStake: 0
                };
            }
            addressStakes[key].validators[event.validatorId].unbonded += event.amount;
        });

        Object.values(addressStakes).forEach(stake => {
            stake.currentStake = stake.totalDelegated - stake.totalUnbonded;
            stake.validatorsList = Object.values(stake.validators)
                .map(v => {
                    v.currentStake = v.delegated - v.unbonded;
                    return v;
                })
                .filter(v => v.currentStake > 0)
                .sort((a, b) => b.currentStake - a.currentStake);
            delete stake.validators;
        });

        const activeDelegators = Object.values(addressStakes)
            .filter(stake => stake.currentStake > 0)
            .sort((a, b) => b.currentStake - a.currentStake)
            .slice(0, topCount)
            .map((stake, index) => ({
                rank: index + 1,
                address: stake.address,
                currentStake: stake.currentStake,
                validators: stake.validatorsList
            }));

        // Display results
        console.log('\n' + '='.repeat(80));
        console.log(`TOP ${activeDelegators.length} ACTIVE DELEGATORS`);
        console.log('='.repeat(80) + '\n');

        activeDelegators.forEach((delegator) => {
            console.log(`${delegator.rank}. ${delegator.address}`);
            console.log(`   Current Stake: ${delegator.currentStake.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
            console.log(`   Validators (${delegator.validators.length}):`);

            delegator.validators.forEach((val, idx) => {
                console.log(`     • ${val.validatorName} (ID: ${val.validatorId}) - ${val.currentStake.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
            });
            console.log('');
        });

        // Summary
        const totalStake = activeDelegators.reduce((sum, d) => sum + d.currentStake, 0);
        console.log('='.repeat(80));
        console.log('SUMMARY');
        console.log('='.repeat(80));
        console.log(`Total Active Delegators: ${activeDelegators.length}`);
        console.log(`Total Current Stake: ${totalStake.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
        console.log(`Average Stake: ${(totalStake / activeDelegators.length).toLocaleString('en-US', { maximumFractionDigits: 2 })} POL\n`);

        // Export
        const filename = `active_delegators_top${topCount}_${monthsBack}m_${new Date().toISOString().slice(0, 10)}.json`;
        await fs.writeJSON(filename, {
            months: monthsBack,
            generatedAt: new Date().toISOString(),
            totalDelegationEvents: delegations.length,
            totalUnbondEvents: allUnbonds.length,
            activeDelegators,
            summary: {
                totalActiveDelegators: activeDelegators.length,
                totalCurrentStake: totalStake,
                averageStake: totalStake / activeDelegators.length
            }
        }, { spaces: 2 });

        console.log(`✅ Results exported to: ${filename}\n`);

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}
