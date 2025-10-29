#!/usr/bin/env node

/**
 * Fetch top delegators using direct RPC calls (no Etherscan API needed)
 * This script queries Ethereum mainnet for ShareMinted events
 */

const axios = require('axios');
const { subMonths } = require('date-fns');

// Configuration
const STAKING_MANAGER_CONTRACT = '0xa59c847bd5ac0172ff4fe912c5d29e5a71a7512b';
const SHARE_MINTED_TOPIC = '0xc9afff0972d33d68c8d330fe0ebd0e9f54491ad8c59ae17330a9206f280f0865';

// Public RPC endpoints (fallback chain)
const PUBLIC_RPC_ENDPOINTS = [
    'https://eth.llamarpc.com',
    'https://rpc.ankr.com/eth',
    'https://ethereum.publicnode.com',
    'https://eth.drpc.org',
    'https://1rpc.io/eth'
];

class DirectRPCDelegatorFetcher {
    constructor() {
        this.rpcEndpoint = PUBLIC_RPC_ENDPOINTS[0];
        this.requestDelay = 500; // ms between requests
        this.batchSize = 5000; // blocks per batch (public RPCs limit to 10k)
    }

    /**
     * Make JSON-RPC call to Ethereum
     */
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
            // Try next RPC endpoint if available
            if (retryCount < PUBLIC_RPC_ENDPOINTS.length - 1) {
                console.warn(`⚠️  RPC error with ${this.rpcEndpoint}, trying next endpoint...`);
                this.rpcEndpoint = PUBLIC_RPC_ENDPOINTS[retryCount + 1];
                await new Promise(resolve => setTimeout(resolve, 1000));
                return this.rpcCall(method, params, retryCount + 1);
            }
            throw error;
        }
    }

    /**
     * Get current block number
     */
    async getCurrentBlock() {
        const blockHex = await this.rpcCall('eth_blockNumber', []);
        return parseInt(blockHex, 16);
    }

    /**
     * Get block by number
     */
    async getBlock(blockNumber) {
        const blockHex = '0x' + blockNumber.toString(16);
        const block = await this.rpcCall('eth_getBlockByNumber', [blockHex, false]);
        return block;
    }

    /**
     * Estimate block number from timestamp using binary search
     */
    async getBlockFromTimestamp(targetTimestamp) {
        console.log(`Estimating block number for timestamp ${new Date(targetTimestamp * 1000).toISOString()}...`);

        const currentBlock = await this.getCurrentBlock();
        const currentBlockData = await this.getBlock(currentBlock);
        const currentTimestamp = parseInt(currentBlockData.timestamp, 16);

        if (targetTimestamp >= currentTimestamp) {
            return currentBlock;
        }

        // Estimate using average block time of 12 seconds
        const timeDiff = currentTimestamp - targetTimestamp;
        const estimatedBlockDiff = Math.floor(timeDiff / 12);
        const estimatedBlock = Math.max(1, currentBlock - estimatedBlockDiff);

        console.log(`Estimated starting block: ${estimatedBlock.toLocaleString()}`);
        return estimatedBlock;
    }

    /**
     * Fetch logs in batches
     */
    async fetchLogs(fromBlock, toBlock, batchSize = 5000) {
        const allLogs = [];
        let currentFrom = fromBlock;

        while (currentFrom <= toBlock) {
            const currentTo = Math.min(currentFrom + batchSize - 1, toBlock);

            console.log(`  Querying blocks ${currentFrom.toLocaleString()} to ${currentTo.toLocaleString()}...`);

            try {
                const logs = await this.rpcCall('eth_getLogs', [{
                    address: STAKING_MANAGER_CONTRACT,
                    topics: [SHARE_MINTED_TOPIC],
                    fromBlock: '0x' + currentFrom.toString(16),
                    toBlock: '0x' + currentTo.toString(16)
                }]);

                console.log(`    Found ${logs.length} events in this batch`);
                allLogs.push(...logs);

                // Delay to be nice to public RPC
                await new Promise(resolve => setTimeout(resolve, this.requestDelay));

            } catch (error) {
                if (error.message.includes('query returned more than') || error.message.includes('exceed maximum')) {
                    // Reduce batch size and retry
                    console.warn(`    ⚠️  Batch too large, splitting into smaller chunks...`);
                    const halfBatch = Math.floor((currentTo - currentFrom + 1) / 2);
                    const firstHalf = await this.fetchLogs(currentFrom, currentFrom + halfBatch - 1, halfBatch);
                    const secondHalf = await this.fetchLogs(currentFrom + halfBatch, currentTo, halfBatch);
                    allLogs.push(...firstHalf, ...secondHalf);
                } else {
                    throw error;
                }
            }

            currentFrom = currentTo + 1;
        }

        return allLogs;
    }

    /**
     * Parse ShareMinted event log
     */
    parseShareMintedEvent(log) {
        // Event ShareMinted(uint256 indexed validatorId, address indexed user, uint256 amount, uint256 tokens)
        // topics[0] = event signature (already filtered)
        // topics[1] = validatorId (indexed)
        // topics[2] = user address (indexed)
        // data = abi.encode(amount, tokens)

        const validatorId = parseInt(log.topics[1], 16);
        const userAddress = '0x' + log.topics[2].slice(26).toLowerCase(); // Remove padding

        // Parse data - contains two uint256 values (amount and tokens)
        // We want the first one (amount)
        const dataWithoutPrefix = log.data.slice(2);
        const amountHex = '0x' + dataWithoutPrefix.slice(0, 64);
        const amount = BigInt(amountHex);

        // Convert from Wei to POL
        const amountPol = Number(amount) / 1e18;

        // Get block number for timestamp lookup
        const blockNumber = parseInt(log.blockNumber, 16);

        return {
            validatorId,
            userAddress,
            amount: amountPol,
            blockNumber,
            transactionHash: log.transactionHash
        };
    }

    /**
     * Convert Wei to POL
     */
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

/**
 * Main function
 */
async function main() {
    const args = process.argv.slice(2);
    const monthsBack = args[0] ? parseInt(args[0]) : 5;
    const topCount = args[1] ? parseInt(args[1]) : 100;
    const exportFile = args[2] || `top_delegators_${monthsBack}m_${new Date().toISOString().slice(0, 10)}.json`;

    console.log('\n' + '='.repeat(80));
    console.log('FETCHING TOP DELEGATORS USING PUBLIC RPC');
    console.log('='.repeat(80));
    console.log(`Time period: Last ${monthsBack} month(s)`);
    console.log(`Top delegators: ${topCount}`);
    console.log(`Using RPC: ${PUBLIC_RPC_ENDPOINTS[0]}`);
    console.log('');

    const fetcher = new DirectRPCDelegatorFetcher();

    try {
        // Calculate time range
        const cutoffDate = subMonths(new Date(), monthsBack);
        const cutoffTimestamp = Math.floor(cutoffDate.getTime() / 1000);

        console.log(`Fetching delegation events from ${cutoffDate.toDateString()} to today...`);

        // Get starting block
        const fromBlock = await fetcher.getBlockFromTimestamp(cutoffTimestamp);
        const toBlock = await fetcher.getCurrentBlock();

        console.log(`Block range: ${fromBlock.toLocaleString()} to ${toBlock.toLocaleString()}`);
        console.log(`Total blocks to scan: ${(toBlock - fromBlock).toLocaleString()}\n`);

        // Fetch logs
        console.log('Fetching ShareMinted events from Ethereum...');
        const logs = await fetcher.fetchLogs(fromBlock, toBlock);

        console.log(`\n✅ Found ${logs.length} delegation events\n`);

        // Fetch all validators for names
        console.log('Fetching validator information...');
        const validatorsResponse = await axios.get('https://staking-api.polygon.technology/api/v2/validators');
        const validators = validatorsResponse.data.result || [];
        const validatorMap = {};
        validators.forEach(v => {
            validatorMap[v.id] = v.name || `Validator ${v.id}`;
        });
        console.log(`Found ${validators.length} validators\n`);

        // Parse events
        console.log('Processing delegation events...');
        const delegations = [];
        logs.forEach(log => {
            try {
                const event = fetcher.parseShareMintedEvent(log);
                delegations.push({
                    validatorId: event.validatorId,
                    validatorName: validatorMap[event.validatorId] || `Validator ${event.validatorId}`,
                    address: event.userAddress,
                    amount: event.amount,
                    transactionHash: event.transactionHash
                });
            } catch (err) {
                // Skip invalid events
            }
        });

        // Fetch unbonds
        console.log('Fetching unbond events from all validators...');
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
                        // Skip invalid events
                    }
                });

                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (err) {
                // Skip validators with errors
            }
        }

        console.log(`\nFound ${allUnbonds.length} unbond events\n`);

        // Calculate net stake per address
        console.log('Calculating net stake per address...');
        const addressStakes = {};

        // Add delegations
        delegations.forEach(event => {
            const key = event.address;
            if (!addressStakes[key]) {
                addressStakes[key] = {
                    address: key,
                    totalDelegated: 0,
                    totalUnbonded: 0,
                    netStake: 0,
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
                    netStake: 0
                };
            }
            addressStakes[key].validators[event.validatorId].delegated += event.amount;
        });

        // Subtract unbonds
        allUnbonds.forEach(event => {
            const key = event.address;
            if (!addressStakes[key]) {
                addressStakes[key] = {
                    address: key,
                    totalDelegated: 0,
                    totalUnbonded: 0,
                    netStake: 0,
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
                    netStake: 0
                };
            }
            addressStakes[key].validators[event.validatorId].unbonded += event.amount;
        });

        // Calculate net stakes
        Object.values(addressStakes).forEach(stake => {
            stake.netStake = stake.totalDelegated - stake.totalUnbonded;

            stake.validatorDetails = Object.values(stake.validators).map(v => {
                v.netStake = v.delegated - v.unbonded;
                return v;
            }).filter(v => v.netStake > 0)
              .sort((a, b) => b.netStake - a.netStake);

            delete stake.validators;
        });

        // Get top delegators
        const topDelegators = Object.values(addressStakes)
            .filter(stake => stake.netStake > 0)
            .sort((a, b) => b.netStake - a.netStake)
            .slice(0, topCount)
            .map((stake, index) => ({
                rank: index + 1,
                ...stake
            }));

        // Display results
        console.log('\n' + '='.repeat(80));
        console.log(`TOP ${topDelegators.length} DELEGATORS BY NET STAKE`);
        console.log('='.repeat(80) + '\n');

        topDelegators.slice(0, 20).forEach((delegator) => {
            console.log(`${delegator.rank}. ${delegator.address}`);
            console.log(`   Net Stake: ${delegator.netStake.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
            console.log(`   Total Delegated: ${delegator.totalDelegated.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
            console.log(`   Total Unbonded: ${delegator.totalUnbonded.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
            console.log(`   Staking with ${delegator.validatorDetails.length} validator(s):`);

            delegator.validatorDetails.slice(0, 3).forEach((val, idx) => {
                console.log(`     ${idx + 1}. ${val.validatorName} (ID: ${val.validatorId}) - ${val.netStake.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
            });

            if (delegator.validatorDetails.length > 3) {
                console.log(`     ... and ${delegator.validatorDetails.length - 3} more validator(s)`);
            }
            console.log('');
        });

        if (topDelegators.length > 20) {
            console.log(`... and ${topDelegators.length - 20} more delegators\n`);
        }

        // Summary
        const totalNetStake = topDelegators.reduce((sum, d) => sum + d.netStake, 0);
        const totalDelegated = topDelegators.reduce((sum, d) => sum + d.totalDelegated, 0);
        const totalUnbonded = topDelegators.reduce((sum, d) => sum + d.totalUnbonded, 0);

        console.log('='.repeat(80));
        console.log('SUMMARY');
        console.log('='.repeat(80));
        console.log(`Total Delegators: ${topDelegators.length.toLocaleString()}`);
        console.log(`Total Net Stake: ${totalNetStake.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
        console.log(`Total Delegated: ${totalDelegated.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
        console.log(`Total Unbonded: ${totalUnbonded.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
        console.log(`Average Net Stake: ${(totalNetStake / topDelegators.length).toLocaleString('en-US', { maximumFractionDigits: 2 })} POL\n`);

        // Export to JSON
        const fs = require('fs-extra');
        await fs.writeJSON(exportFile, {
            months: monthsBack,
            generatedAt: new Date().toISOString(),
            fromBlock,
            toBlock,
            totalDelegationEvents: delegations.length,
            totalUnbondEvents: allUnbonds.length,
            topDelegators,
            summary: {
                totalDelegators: topDelegators.length,
                totalNetStake,
                totalDelegated,
                totalUnbonded,
                averageNetStake: totalNetStake / topDelegators.length
            }
        }, { spaces: 2 });

        console.log(`✅ Results exported to: ${exportFile}\n`);

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { DirectRPCDelegatorFetcher };
