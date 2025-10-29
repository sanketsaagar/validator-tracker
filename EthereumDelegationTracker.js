const axios = require('axios');
const { subMonths } = require('date-fns');

/**
 * Tracks delegation events on Ethereum mainnet by monitoring ShareMinted events
 * from buyVoucher transactions on the Polygon Staking Manager contract
 */
class EthereumDelegationTracker {
  constructor() {
    this.etherscanApiKey = process.env.ETHERSCAN_API_KEY || 'YourApiKeyToken';

    // Polygon Staking Manager contract on Ethereum mainnet that emits ShareMinted events
    this.stakingManagerContract = '0xa59c847bd5ac0172ff4fe912c5d29e5a71a7512b';

    // Event signature for ShareMinted(uint256,address,uint256,uint256)
    this.shareMintedTopic = '0xc9afff0972d33d68c8d330fe0ebd0e9f54491ad8c59ae17330a9206f280f0865';

    // Rate limiting
    this.requestDelay = 200; // ms between requests

    // Cache for processed events / block timestamps
    this.eventCache = new Map();
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Fetch ShareMinted events for a specific validator from Ethereum mainnet
   */
  async fetchDelegationEvents(validatorId, monthsBack = 6) {
    if (!this.etherscanApiKey || this.etherscanApiKey === 'YourApiKeyToken') {
      console.warn('⚠️  Etherscan API key not configured. Cannot fetch Ethereum delegation data.');
      return [];
    }

    const cutoffDate = subMonths(new Date(), monthsBack);
    const cutoffTimestamp = Math.floor(cutoffDate.getTime() / 1000);

    console.log(`Fetching Ethereum delegation events for Validator ${validatorId}...`);
    console.log(`Time range: ${cutoffDate.toDateString()} to ${new Date().toDateString()}`);
    console.log('===================================================================')

    try {
      // Fetch event logs from Etherscan API
      const url = 'https://api.etherscan.io/api';
      const params = {
        module: 'logs',
        action: 'getLogs',
        address: this.stakingManagerContract,          // ✅ limit to Staking Manager
        topic0: this.shareMintedTopic,                 // ShareMinted event signature
        topic1: this.padValidatorId(validatorId),      // Filter by validator ID (must be indexed in the event)
        fromBlock: await this.getBlockFromTimestamp(cutoffTimestamp),
        toBlock: 'latest',
        apikey: this.etherscanApiKey
      };

      console.log(`Querying Etherscan for ShareMinted events...`);
      const response = await axios.get(url, { params, timeout: 15000 });

      if (response.data.status !== '1') {
        console.warn(`⚠️  Etherscan API error: ${response.data.message}`);
        return [];
      }

      const events = response.data.result || [];
      console.log(`Found ${events.length} raw delegation events on Ethereum`);

      // Process and filter events
      const processedEvents = await this.processDelegationEvents(events, cutoffTimestamp);

      console.log(`Processed ${processedEvents.length} delegation events for Validator ${validatorId}`);

      await this.sleep(this.requestDelay);
      return processedEvents;

    } catch (error) {
      console.error(`❌ Error fetching Ethereum delegation events: ${error.message}`);
      if (error.response?.status === 401) {
        console.warn('🔑 Invalid Etherscan API key');
      } else if (error.response?.status === 429) {
        console.warn('⏳ Etherscan API rate limit hit');
      }
      return [];
    }
  }

  /**
   * Process raw event logs into structured delegation events
   * Uses precise decimal formatting (no float precision loss)
   */
  async processDelegationEvents(events, cutoffTimestamp) {
    const processedEvents = [];

    for (const event of events) {
      try {
        // Etherscan returns hex timestamp strings on logs; if missing, fetch by block
        const blockTimestamp =
          (typeof event.timeStamp === 'string' ? parseInt(event.timeStamp, 16) : NaN) ||
          await this.getBlockTimestamp(event.blockNumber);

        // Skip events outside our time range
        if (blockTimestamp < cutoffTimestamp) {
          continue;
        }

        // Parse event topics and data
        const validatorId = parseInt(event.topics[1], 16);
        const userAddress = '0x' + event.topics[2].slice(26); // Remove padding from address

        // Parse amount from event data (first 32 bytes after non-indexed fields start)
        const amountHex = event.data.slice(0, 66); // "0x" + 64 hex chars
        const amountWei = BigInt(amountHex);
        const amountPolStr = this.formatUnits(amountWei, 18);

        const processedEvent = {
          validatorId,
          user: userAddress.toLowerCase(),
          amountWei: amountWei.toString(),      // raw amount in wei (as string)
          amountPol: amountPolStr,              // precise decimal string
          blockNumber: parseInt(event.blockNumber, 16),
          transactionHash: event.transactionHash,
          timestamp: blockTimestamp,
          parsedTime: new Date(blockTimestamp * 1000),
          eventType: 'delegation',
          source: 'ethereum'
        };

        processedEvents.push(processedEvent);

      } catch (error) {
        console.warn(`⚠️  Error processing event: ${error.message}`);
        continue;
      }
    }

    // Sort by timestamp
    processedEvents.sort((a, b) => a.timestamp - b.timestamp);

    return processedEvents;
  }

  /**
   * Convert validator ID to padded hex format for topic filtering
   */
  padValidatorId(validatorId) {
    return '0x' + Number(validatorId).toString(16).padStart(64, '0');
  }

  /**
   * Resolve a block number from a UNIX timestamp using Etherscan (precise).
   * Falls back to a conservative estimate if the API call fails.
   */
  async getBlockFromTimestamp(timestamp) {
    try {
      const { data } = await axios.get('https://api.etherscan.io/api', {
        params: {
          module: 'block',
          action: 'getblocknobytime',
          timestamp,              // unix seconds
          closest: 'before',
          apikey: this.etherscanApiKey
        },
        timeout: 15000
      });
      if (data.status !== '1' || !data.result) {
        throw new Error(data.message || 'No result from getblocknobytime');
      }
      const block = parseInt(data.result, 10);
      console.log(`Resolved start block by time: ${block}`);
      return block;
    } catch (err) {
      console.warn(`⚠️  Timestamp→block lookup failed, using fallback: ${err.message}`);
      // Fallback: approximate by assuming ~12s block time from "latest"
      const now = Math.floor(Date.now() / 1000);
      const approxBlocks = Math.floor((now - timestamp) / 12);
      const head = await axios.get('https://api.etherscan.io/api', {
        params: { module: 'proxy', action: 'eth_blockNumber', apikey: this.etherscanApiKey },
        timeout: 10000
      });
      const currentBlock = parseInt(head.data.result, 16);
      return Math.max(1, currentBlock - approxBlocks);
    }
  }

  /**
   * Get block timestamp from block number
   */
  async getBlockTimestamp(blockNumber) {
    try {
      const cacheKey = `block_${blockNumber}`;
      if (this.eventCache.has(cacheKey)) {
        return this.eventCache.get(cacheKey);
      }

      const response = await axios.get('https://api.etherscan.io/api', {
        params: {
          module: 'proxy',
          action: 'eth_getBlockByNumber',
          tag:
            (typeof blockNumber === 'string' && blockNumber.startsWith('0x'))
              ? blockNumber
              : '0x' + Number(blockNumber).toString(16),
          boolean: false,
          apikey: this.etherscanApiKey
        },
        timeout: 15000
      });

      const timestamp = parseInt(response.data.result.timestamp, 16);
      this.eventCache.set(cacheKey, timestamp);

      await this.sleep(100); // Small delay to avoid rate limits
      return timestamp;

    } catch (error) {
      console.warn(`⚠️  Error getting block timestamp: ${error.message}`);
      return Math.floor(Date.now() / 1000); // Fallback to current time
    }
  }

  /**
 * Get delegation summary for a validator
 * Returns only total delegated amount (and optionally count of events)
 */
async getDelegationSummary(validatorId, monthsBack = 6) {
  const events = await this.fetchDelegationEvents(validatorId, monthsBack);

  if (events.length === 0) {
    return `Total Delegated: 0 POL`;
  }

  // Sum all amounts in wei
  let totalDelegatedWei = 0n;
  for (const event of events) {
    totalDelegatedWei += BigInt(event.amountWei);
  }

  // Convert to readable POL format
  const totalPol = this.formatUnits(totalDelegatedWei, 18);

  // Return clean summary string
  return `Total Delegated: ${totalPol} POL (${events.length} events)`;
}

  /**
   * Verify API key is working
   */
  async testApiConnection() {
    if (!this.etherscanApiKey || this.etherscanApiKey === 'YourApiKeyToken') {
      return { success: false, message: 'API key not configured' };
    }

    try {
      const response = await axios.get('https://api.etherscan.io/api', {
        params: {
          module: 'proxy',
          action: 'eth_blockNumber',
          apikey: this.etherscanApiKey
        },
        timeout: 10000
      });

      if (response.data.result) {
        return { success: true, message: 'API connection successful' };
      } else {
        return { success: false, message: 'Invalid API response' };
      }

    } catch (error) {
      return {
        success: false,
        message: error.response?.status === 401 ? 'Invalid API key' : error.message
      };
    }
  }

  /**
   * Format a BigInt `value` with `decimals` places into a precise decimal string.
   * Example: formatUnits(1000000000000000000n, 18) -> "1"
   */
  formatUnits(value, decimals = 18) {
    const negative = value < 0n;
    let val = negative ? -value : value;

    const base = 10n ** BigInt(decimals);
    const integer = val / base;
    const fraction = val % base;

    let fracStr = fraction.toString().padStart(decimals, '0');
    // Trim trailing zeros from fractional part
    fracStr = fracStr.replace(/0+$/, '');

    return (negative ? '-' : '') + integer.toString() + (fracStr ? '.' + fracStr : '');
  }
}

module.exports = EthereumDelegationTracker;
