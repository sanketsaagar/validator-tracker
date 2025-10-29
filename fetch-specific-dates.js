#!/usr/bin/env node

/**
 * Fetch specific date ranges:
 * 1. Stakings: June 15-23, 2025
 * 2. Unstakings: June 23 - August 1, 2025
 */

const axios = require('axios');
const fs = require('fs-extra');

// Configuration
const STAKING_MANAGER_CONTRACT = '0xa59c847bd5ac0172ff4fe912c5d29e5a71a7512b';
const SHARE_MINTED_TOPIC = '0xc9afff0972d33d68c8d330fe0ebd0e9f54491ad8c59ae17330a9206f280f0865';
// UnstakeInit event topic (for unbonding on Ethereum)
const UNSTAKE_INIT_TOPIC = '0x9a8f44850296624dadfd9c246d17e47171d35727a181bd090aa14bbbe00238bb';

// Public RPC endpoints
const PUBLIC_RPC_ENDPOINTS = [
    'https://eth.llamarpc.com',
    'https://rpc.ankr.com/eth',
    'https://ethereum.publicnode.com',
    'https://eth.drpc.org',
    'https://1rpc.io/eth'
];

// Date ranges
const STAKING_START = new Date('2025-06-15T00:00:00Z');
const STAKING_END = new Date('2025-06-23T23:59:59Z');
const UNSTAKING_START = new Date('2025-06-23T00:00:00Z');
const UNSTAKING_END = new Date('2025-08-01T23:59:59Z');

class SpecificDatesFetcher {
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
        const currentBlock = await this.getCurrentBlock();
        const currentBlockData = await this.getBlock(currentBlock);
        const currentTimestamp = parseInt(currentBlockData.timestamp, 16);

        if (targetTimestamp >= currentTimestamp) {
            return currentBlock;
        }

        const timeDiff = currentTimestamp - targetTimestamp;
        const estimatedBlockDiff = Math.floor(timeDiff / 12);
        const estimatedBlock = Math.max(1, currentBlock - estimatedBlockDiff);
        return estimatedBlock;
    }

    async fetchLogs(fromBlock, toBlock) {
        const allLogs = [];
        let currentFrom = fromBlock;

        while (currentFrom <= toBlock) {
            const currentTo = Math.min(currentFrom + this.batchSize - 1, toBlock);

            try {
                const logs = await this.rpcCall('eth_getLogs', [{
                    address: STAKING_MANAGER_CONTRACT,
                    topics: [SHARE_MINTED_TOPIC],
                    fromBlock: '0x' + currentFrom.toString(16),
                    toBlock: '0x' + currentTo.toString(16)
                }]);

                console.log(`  Blocks ${currentFrom.toLocaleString()} - ${currentTo.toLocaleString()}: ${logs.length} events`);
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
        const blockNumber = parseInt(log.blockNumber, 16);

        return {
            validatorId,
            address: userAddress,
            amount: amountPol,
            blockNumber,
            transactionHash: log.transactionHash
        };
    }

    parseUnstakeInitEvent(log) {
        // UnstakeInit event: UnstakeInit(address indexed user, uint256 indexed validatorId, uint256 amount, uint256 deactivationEpoch)
        const userAddress = '0x' + log.topics[1].slice(26).toLowerCase();
        const validatorId = parseInt(log.topics[2], 16);
        const dataWithoutPrefix = log.data.slice(2);
        const amountHex = '0x' + dataWithoutPrefix.slice(0, 64);
        const amount = BigInt(amountHex);
        const amountPol = Number(amount) / 1e18;
        const blockNumber = parseInt(log.blockNumber, 16);

        return {
            validatorId,
            address: userAddress,
            amount: amountPol,
            blockNumber,
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
    console.log('\n' + '='.repeat(80));
    console.log('FETCHING SPECIFIC DATE RANGE DATA');
    console.log('='.repeat(80));
    console.log('Staking Period: June 15-23, 2025');
    console.log('Unstaking Period: June 23 - August 1, 2025');
    console.log('');

    const fetcher = new SpecificDatesFetcher();

    try {
        // =====================================================================
        // PART 1: FETCH STAKINGS (June 15-23, 2025)
        // =====================================================================
        console.log('PART 1: FETCHING STAKINGS (June 15-23, 2025)');
        console.log('='.repeat(80));

        const stakingStartTimestamp = Math.floor(STAKING_START.getTime() / 1000);
        const stakingEndTimestamp = Math.floor(STAKING_END.getTime() / 1000);

        console.log(`Getting block numbers for date range...`);
        const stakingFromBlock = await fetcher.getBlockFromTimestamp(stakingStartTimestamp);
        const stakingToBlock = await fetcher.getBlockFromTimestamp(stakingEndTimestamp);

        console.log(`Block range: ${stakingFromBlock.toLocaleString()} to ${stakingToBlock.toLocaleString()}`);
        console.log(`Total blocks: ${(stakingToBlock - stakingFromBlock).toLocaleString()}\n`);

        console.log('Fetching staking events from Ethereum...');
        const stakingLogs = await fetcher.fetchLogs(stakingFromBlock, stakingToBlock);
        console.log(`\n✅ Found ${stakingLogs.length} staking events\n`);

        // Fetch validator names
        console.log('Fetching validator information...');
        const validatorsResponse = await axios.get('https://staking-api.polygon.technology/api/v2/validators');
        const validators = validatorsResponse.data.result || [];
        const validatorMap = {};
        validators.forEach(v => {
            validatorMap[v.id] = v.name || `Validator ${v.id}`;
        });
        console.log(`Found ${validators.length} validators\n`);

        // Process staking events
        console.log('Processing staking events...');
        const stakingEvents = [];
        stakingLogs.forEach(log => {
            try {
                const event = fetcher.parseShareMintedEvent(log);
                stakingEvents.push({
                    address: event.address,
                    validatorId: event.validatorId,
                    validatorName: validatorMap[event.validatorId] || `Validator ${event.validatorId}`,
                    amount: event.amount,
                    transactionHash: event.transactionHash,
                    blockNumber: event.blockNumber
                });
            } catch (err) {
                // Skip invalid events
            }
        });

        console.log(`Processed ${stakingEvents.length} valid staking events\n`);

        // =====================================================================
        // PART 2: FETCH UNSTAKINGS (June 23 - August 1, 2025)
        // =====================================================================
        console.log('PART 2: FETCHING UNSTAKINGS (June 23 - August 1, 2025)');
        console.log('='.repeat(80));

        const unstakingEvents = [];
        let processedCount = 0;

        console.log('Fetching unbond events from Polygon API (includes tx hashes)...');
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

                        // Check if event is in our date range
                        if (eventTime >= UNSTAKING_START && eventTime <= UNSTAKING_END) {
                            const amountPol = fetcher.fromWeiToPol(String(event.amount));

                            unstakingEvents.push({
                                address: event.user.toLowerCase(),
                                validatorId: validator.id,
                                validatorName: validator.name || `Validator ${validator.id}`,
                                amount: amountPol,
                                transactionHash: event.unbondStartedTxHash || null,
                                timestamp: timestamp,
                                date: eventTime.toISOString(),
                                nonce: event.nonce
                            });
                        }
                    } catch (err) {
                        // Skip invalid events
                    }
                });

                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (err) {
                console.error(`  Error processing validator ${validator.id}: ${err.message}`);
            }
        }

        console.log(`\n✅ Found ${unstakingEvents.length} unstaking events\n`);

        // =====================================================================
        // DISPLAY RESULTS
        // =====================================================================

        console.log('='.repeat(80));
        console.log('STAKING EVENTS SUMMARY (June 15-23, 2025)');
        console.log('='.repeat(80));
        console.log(`Total Events: ${stakingEvents.length}`);
        const totalStakingAmount = stakingEvents.reduce((sum, e) => sum + e.amount, 0);
        console.log(`Total Staked: ${totalStakingAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
        console.log(`Unique Addresses: ${new Set(stakingEvents.map(e => e.address)).size}`);
        console.log(`Unique Validators: ${new Set(stakingEvents.map(e => e.validatorId)).size}\n`);

        console.log('Sample (first 10):');
        stakingEvents.slice(0, 10).forEach((event, idx) => {
            console.log(`${idx + 1}. ${event.address}`);
            console.log(`   Validator: ${event.validatorName} (ID: ${event.validatorId})`);
            console.log(`   Amount: ${event.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
            console.log(`   TX: ${event.transactionHash}`);
            console.log('');
        });

        console.log('='.repeat(80));
        console.log('UNSTAKING EVENTS SUMMARY (June 23 - Aug 1, 2025)');
        console.log('='.repeat(80));
        console.log(`Total Events: ${unstakingEvents.length}`);
        const totalUnstakingAmount = unstakingEvents.reduce((sum, e) => sum + e.amount, 0);
        console.log(`Total Unstaked: ${totalUnstakingAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
        console.log(`Unique Addresses: ${new Set(unstakingEvents.map(e => e.address)).size}`);
        console.log(`Unique Validators: ${new Set(unstakingEvents.map(e => e.validatorId)).size}\n`);

        console.log('Sample (first 10):');
        unstakingEvents.slice(0, 10).forEach((event, idx) => {
            console.log(`${idx + 1}. ${event.address}`);
            console.log(`   Validator: ${event.validatorName} (ID: ${event.validatorId})`);
            console.log(`   Amount: ${event.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} POL`);
            console.log(`   TX Hash: ${event.transactionHash}`);
            console.log('');
        });

        // =====================================================================
        // EXPORT TO JSON
        // =====================================================================

        const stakingFile = 'stakings_june15_23_2025.json';
        const unstakingFile = 'unstakings_june23_aug1_2025.json';

        await fs.writeJSON(stakingFile, {
            dateRange: {
                start: STAKING_START.toISOString(),
                end: STAKING_END.toISOString()
            },
            generatedAt: new Date().toISOString(),
            totalEvents: stakingEvents.length,
            totalAmount: totalStakingAmount,
            uniqueAddresses: new Set(stakingEvents.map(e => e.address)).size,
            uniqueValidators: new Set(stakingEvents.map(e => e.validatorId)).size,
            events: stakingEvents.sort((a, b) => b.amount - a.amount) // Sort by amount descending
        }, { spaces: 2 });

        await fs.writeJSON(unstakingFile, {
            dateRange: {
                start: UNSTAKING_START.toISOString(),
                end: UNSTAKING_END.toISOString()
            },
            generatedAt: new Date().toISOString(),
            totalEvents: unstakingEvents.length,
            totalAmount: totalUnstakingAmount,
            uniqueAddresses: new Set(unstakingEvents.map(e => e.address)).size,
            uniqueValidators: new Set(unstakingEvents.map(e => e.validatorId)).size,
            events: unstakingEvents.sort((a, b) => b.amount - a.amount) // Sort by amount descending
        }, { spaces: 2 });

        console.log('='.repeat(80));
        console.log('✅ EXPORT COMPLETE');
        console.log('='.repeat(80));
        console.log(`Staking events: ${stakingFile}`);
        console.log(`Unstaking events: ${unstakingFile}`);
        console.log('');

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { SpecificDatesFetcher };
