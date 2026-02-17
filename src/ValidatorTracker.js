const axios = require('axios');
const fs = require('fs-extra');
const { format, subMonths } = require('date-fns');
const DelegatorFilter = require('./DelegatorFilter');
const EthereumDelegationTracker = require('./EthereumDelegationTracker');

class ValidatorTracker {
  constructor(validatorId, monthsBack = 6, options = {}) {
    this.validatorId = validatorId;
    this.monthsBack = monthsBack;
    this.cutoffDate = subMonths(new Date(), monthsBack);

    // Filtering options
    this.filterExchanges = options.filterExchanges !== false;
    this.filterDefi = options.filterDefi !== false;
    this.filterInstitutional = options.filterInstitutional !== false;

    // API endpoints
    this.baseUrl = 'https://staking-api.polygon.technology/api/v2';
    this.unbondsUrl = validatorId ? `${this.baseUrl}/validators/unbonds/${validatorId}` : null;
    this.validatorUrl = validatorId ? `${this.baseUrl}/validators/${validatorId}` : null;
    this.allValidatorsUrl = `${this.baseUrl}/validators`;

    // Data storage
    this.unbondData = [];
    this.delegationData = [];
    this.validatorInfo = {};
    this.filteredDelegators = [];
    this.filterResults = null;

    // Initialize helpers
    this.delegatorFilter = new DelegatorFilter();
    this.ethereumDelegationTracker = new EthereumDelegationTracker();
  }

  static async fetchAllValidators() {
    try {
      console.log('Fetching all validators...');
      const baseUrl = 'https://staking-api.polygon.technology/api/v2';
      const response = await axios.get(`${baseUrl}/validators`);
      const validators = response.data.result || [];
      console.log(`Found ${validators.length} validators`);
      return validators;
    } catch (error) {
      console.error(`❌ Error fetching validators: ${error.message}`);
      return [];
    }
  }

  static async fetchAllUnbondsAcrossValidators(days = 7, limit = 10) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      console.log(`Fetching unbonding events from all validators (last ${days} days)...`);

      // Fetch all validators
      const validators = await ValidatorTracker.fetchAllValidators();
      if (validators.length === 0) {
        return [];
      }

      const allUnbonds = [];
      const baseUrl = 'https://staking-api.polygon.technology/api/v2';

      // Fetch unbonds for each validator
      let processedCount = 0;
      for (const validator of validators) {
        processedCount++;
        if (processedCount % 10 === 0) {
          console.log(`Progress: ${processedCount}/${validators.length} validators processed...`);
        }

        try {
          const unbondsUrl = `${baseUrl}/validators/unbonds/${validator.id}`;
          const response = await axios.get(unbondsUrl);
          const events = response.data.result || [];

          events.forEach(event => {
            try {
              const timestamp = parseInt(event.unbondStartedTimeStamp);
              const eventTime = new Date(timestamp * 1000);
              if (eventTime >= cutoffDate) {
                const amountPol = ValidatorTracker.fromWeiToPolNumberStatic(String(event.amount));
                allUnbonds.push({
                  validatorId: validator.id,
                  validatorName: validator.name || `Validator ${validator.id}`,
                  address: event.user,
                  amount: amountPol,
                  date: eventTime,
                  timestamp: event.unbondStartedTimeStamp,
                  nonce: event.nonce
                });
              }
            } catch (err) {
              // Skip invalid events
            }
          });

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (err) {
          // Skip validators with errors
          console.error(`Error fetching unbonds for validator ${validator.id}: ${err.message}`);
        }
      }

      console.log(`Found ${allUnbonds.length} unbonding events across all validators`);

      // Sort by amount and return top N
      return allUnbonds
        .sort((a, b) => b.amount - a.amount)
        .slice(0, limit)
        .map((event, index) => ({
          rank: index + 1,
          ...event
        }));

    } catch (error) {
      console.error(`❌ Error fetching all unbonds: ${error.message}`);
      return [];
    }
  }

  static async fetchRecentDelegations(hours = 48, limit = 50) {
    try {
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - hours * 60 * 60 * 1000);
      const cutoffTimestamp = Math.floor(cutoffDate.getTime() / 1000);

      console.log(`\nFetching new delegations in the last ${hours} hours...`);
      console.log(`Time range: ${cutoffDate.toLocaleString()} to ${now.toLocaleString()}`);
      console.log('⏳ Querying Ethereum for ShareMinted events...\n');

      // Fetch all validators to get names
      const validators = await ValidatorTracker.fetchAllValidators();
      if (validators.length === 0) {
        return [];
      }

      // Create validator lookup map
      const validatorMap = {};
      validators.forEach(v => {
        validatorMap[v.id] = v.name || `Validator ${v.id}`;
      });

      const ethereumTracker = new EthereumDelegationTracker();

      // Check if API key is configured
      if (!ethereumTracker.etherscanApiKey || ethereumTracker.etherscanApiKey === 'YourApiKeyToken') {
        console.error('❌ ETHERSCAN_API_KEY not configured. This is required to fetch delegation data.');
        console.error('Please set ETHERSCAN_API_KEY in your .env file or environment variables.');
        return [];
      }

      // Get starting block for the time period
      let fromBlock;
      try {
        const response = await axios.get('https://api.etherscan.io/v2/api', {
          params: {
            chainid: 1,
            module: 'block',
            action: 'getblocknobytime',
            timestamp: cutoffTimestamp,
            closest: 'before',
            apikey: ethereumTracker.etherscanApiKey
          },
          timeout: 15000
        });

        if (response.data.status === '1' && response.data.result) {
          fromBlock = parseInt(response.data.result, 10);
        } else {
          throw new Error(response.data.message || 'Block lookup failed');
        }
      } catch (err) {
        console.warn(`⚠️  Could not get start block, using approximate: ${err.message}`);
        // Approximate: 12 second blocks
        const approxBlocks = Math.floor((hours * 3600) / 12);
        try {
          const headResponse = await axios.get('https://api.etherscan.io/v2/api', {
            params: {
              chainid: 1,
              module: 'proxy',
              action: 'eth_blockNumber',
              apikey: ethereumTracker.etherscanApiKey
            },
            timeout: 10000
          });
          const currentBlock = parseInt(headResponse.data.result, 16);
          fromBlock = Math.max(1, currentBlock - approxBlocks);
        } catch (blockErr) {
          console.error(`❌ Could not get current block number: ${blockErr.message}`);
          return [];
        }
      }

      console.log(`Querying Ethereum logs from block ${fromBlock} to latest...`);

      // Validate fromBlock
      if (!fromBlock || fromBlock <= 0) {
        console.error('❌ Invalid starting block number. Cannot proceed.');
        return [];
      }

      // Fetch ALL ShareMinted events in the time period
      const logsResponse = await axios.get('https://api.etherscan.io/v2/api', {
        params: {
          chainid: 1,
          module: 'logs',
          action: 'getLogs',
          address: ethereumTracker.stakingManagerContract,
          topic0: ethereumTracker.shareMintedTopic,
          fromBlock: fromBlock,
          toBlock: 'latest',
          apikey: ethereumTracker.etherscanApiKey
        },
        timeout: 30000
      });

      if (logsResponse.data.status !== '1') {
        console.error(`❌ Etherscan API error: ${logsResponse.data.message}`);
        return [];
      }

      const events = logsResponse.data.result || [];
      console.log(`Found ${events.length} raw delegation events on Ethereum`);

      const allDelegations = [];

      // Process delegation events
      for (const event of events) {
        try {
          const validatorId = parseInt(event.topics[1], 16);
          const user = '0x' + event.topics[2].slice(26);
          const amount = BigInt(event.data);
          const amountPol = ValidatorTracker.fromWeiToPolNumberStatic(amount.toString());

          // Parse timestamp from event
          const timestamp = parseInt(event.timeStamp, 16);
          const eventDate = new Date(timestamp * 1000);

          // Only include events within our time window
          if (eventDate >= cutoffDate) {
            allDelegations.push({
              validatorId: validatorId,
              validatorName: validatorMap[validatorId] || `Validator ${validatorId}`,
              address: user.toLowerCase(),
              amount: Number(amountPol),
              date: eventDate,
              timestamp: timestamp,
              transactionHash: event.transactionHash,
              blockNumber: parseInt(event.blockNumber, 16)
            });
          }
        } catch (err) {
          // Skip invalid events
          console.warn(`⚠️  Error processing event: ${err.message}`);
        }
      }

      // Sort by date (most recent first)
      allDelegations.sort((a, b) => b.date - a.date);

      // Apply limit and add rank
      const topDelegations = allDelegations.slice(0, limit).map((d, index) => ({
        ...d,
        rank: index + 1
      }));

      console.log(`Processed ${topDelegations.length} delegation events in the time period\n`);
      return topDelegations;

    } catch (error) {
      console.error(`❌ Error fetching recent delegations: ${error.message}`);
      return [];
    }
  }

  static async fetchAllDelegatorsAcrossValidators(months = 6, limit = 100) {
    try {
      console.log(`\nFetching delegations across all validators (last ${months} month(s))...`);
      console.log('⏳ This approach fetches ALL delegation events from Ethereum in one query...\n');

      // Fetch all validators to get names
      const validators = await ValidatorTracker.fetchAllValidators();
      if (validators.length === 0) {
        return [];
      }

      // Create validator lookup map
      const validatorMap = {};
      validators.forEach(v => {
        validatorMap[v.id] = v.name || `Validator ${v.id}`;
      });

      const ethereumTracker = new (require('./EthereumDelegationTracker'))();

      // Check if API key is configured
      if (!ethereumTracker.etherscanApiKey || ethereumTracker.etherscanApiKey === 'YourApiKeyToken') {
        console.error('❌ ETHERSCAN_API_KEY not configured. This is required to fetch delegation data.');
        console.error('Please set ETHERSCAN_API_KEY in your .env file or environment variables.');
        return [];
      }

      const allDelegations = [];
      const allUnbonds = [];
      const baseUrl = 'https://staking-api.polygon.technology/api/v2';

      // OPTIMIZED: Fetch ALL delegation events at once (not per validator)
      console.log('Fetching ALL delegation events from Ethereum...');
      const cutoffDate = subMonths(new Date(), months);
      const cutoffTimestamp = Math.floor(cutoffDate.getTime() / 1000);

      try {
        // Get starting block
        let fromBlock;
        try {
          const response = await axios.get('https://api.etherscan.io/api', {
            params: {
              module: 'block',
              action: 'getblocknobytime',
              timestamp: cutoffTimestamp,
              closest: 'before',
              apikey: ethereumTracker.etherscanApiKey
            },
            timeout: 15000
          });
          fromBlock = response.data.status === '1' ? parseInt(response.data.result, 10) : 0;
        } catch (err) {
          console.warn(`⚠️  Could not get start block, using approximate: ${err.message}`);
          // Approximate: 12 second blocks
          const now = Math.floor(Date.now() / 1000);
          const approxBlocks = Math.floor((now - cutoffTimestamp) / 12);
          const headResponse = await axios.get('https://api.etherscan.io/api', {
            params: { module: 'proxy', action: 'eth_blockNumber', apikey: ethereumTracker.etherscanApiKey }
          });
          const currentBlock = parseInt(headResponse.data.result, 16);
          fromBlock = Math.max(1, currentBlock - approxBlocks);
        }

        console.log(`Querying Ethereum logs from block ${fromBlock} to latest...`);

        // Fetch ALL ShareMinted events (not filtered by validator)
        const logsResponse = await axios.get('https://api.etherscan.io/api', {
          params: {
            module: 'logs',
            action: 'getLogs',
            address: ethereumTracker.stakingManagerContract,
            topic0: ethereumTracker.shareMintedTopic,
            fromBlock: fromBlock,
            toBlock: 'latest',
            apikey: ethereumTracker.etherscanApiKey
          },
          timeout: 30000
        });

        if (logsResponse.data.status !== '1') {
          console.error(`❌ Etherscan API error: ${logsResponse.data.message}`);
          console.error('This could be due to:');
          console.error('  - Rate limit exceeded');
          console.error('  - Invalid API key');
          console.error('  - Too many results (try reducing --months)');
          return [];
        }

        const events = logsResponse.data.result || [];
        console.log(`Found ${events.length} delegation events on Ethereum`);

        // Process delegation events
        events.forEach(event => {
          try {
            const validatorId = parseInt(event.topics[1], 16);
            const user = '0x' + event.topics[2].slice(26);
            const amount = BigInt(event.data);
            const amountPol = ValidatorTracker.fromWeiToPolNumberStatic(amount.toString());

            allDelegations.push({
              validatorId: validatorId,
              validatorName: validatorMap[validatorId] || `Validator ${validatorId}`,
              address: user.toLowerCase(),
              amount: Number(amountPol),
              date: new Date(parseInt(event.timeStamp, 16) * 1000),
              type: 'delegation'
            });
          } catch (err) {
            // Skip invalid events
          }
        });

      } catch (err) {
        console.error(`❌ Error fetching delegation events: ${err.message}`);
        return [];
      }

      // Fetch unbonds from Polygon API for all validators
      console.log('\nFetching unbond events from all validators...');
      let processedCount = 0;
      for (const validator of validators) {
        processedCount++;
        if (processedCount % 10 === 0) {
          console.log(`Progress: ${processedCount}/${validators.length} validators processed...`);
        }

        try {
          const unbondsUrl = `${baseUrl}/validators/unbonds/${validator.id}`;
          const unbondsResponse = await axios.get(unbondsUrl);
          const unbondEvents = unbondsResponse.data.result || [];

          unbondEvents.forEach(event => {
            try {
              const timestamp = parseInt(event.unbondStartedTimeStamp);
              const eventTime = new Date(timestamp * 1000);
              if (eventTime >= cutoffDate) {
                const amountPol = ValidatorTracker.fromWeiToPolNumberStatic(String(event.amount));
                allUnbonds.push({
                  validatorId: validator.id,
                  validatorName: validator.name || `Validator ${validator.id}`,
                  address: event.user.toLowerCase(),
                  amount: amountPol,
                  date: eventTime,
                  type: 'unbond'
                });
              }
            } catch (err) {
              // Skip invalid events
            }
          });

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (err) {
          console.error(`  ⚠️  Error fetching unbonds for validator ${validator.id}: ${err.message}`);
        }
      }

      console.log(`\nFound ${allDelegations.length} delegation events`);
      console.log(`Found ${allUnbonds.length} unbond events`);
      console.log('\nCalculating net stake per address...\n');

      // Calculate net stake per address
      const addressStakes = {};

      // Add delegations
      allDelegations.forEach(event => {
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

        // Track per-validator delegation
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

        // Track per-validator unbond
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

      // Calculate net stakes and convert validators object to array
      Object.values(addressStakes).forEach(stake => {
        stake.netStake = stake.totalDelegated - stake.totalUnbonded;

        // Calculate net stake per validator and convert to array
        stake.validatorDetails = Object.values(stake.validators).map(v => {
          v.netStake = v.delegated - v.unbonded;
          return v;
        }).filter(v => v.netStake > 0) // Only include validators with positive stake
          .sort((a, b) => b.netStake - a.netStake); // Sort by net stake descending

        delete stake.validators; // Remove the object version
      });

      // Filter to only addresses with positive net stake and sort
      const topDelegators = Object.values(addressStakes)
        .filter(stake => stake.netStake > 0)
        .sort((a, b) => b.netStake - a.netStake)
        .slice(0, limit)
        .map((stake, index) => ({
          rank: index + 1,
          ...stake
        }));

      console.log(`Found ${Object.keys(addressStakes).length} unique addresses`);
      console.log(`Addresses with positive stake: ${Object.values(addressStakes).filter(s => s.netStake > 0).length}\n`);

      return topDelegators;

    } catch (error) {
      console.error(`❌ Error fetching all delegators: ${error.message}`);
      console.error(error.stack);
      return [];
    }
  }

  static fromWeiToPolNumberStatic(weiLike) {
    if (typeof weiLike === 'string' && /^0x[0-9a-f]+$/i.test(weiLike)) {
      weiLike = BigInt(weiLike).toString();
    }
    const s = String(weiLike).replace(/^0+/, '') || '0';
    const len = s.length;
    if (len <= 18) {
      return Number(`0.${'0'.repeat(18 - len)}${s}`);
    }
    const whole = s.slice(0, len - 18);
    const frac = s.slice(len - 18).replace(/0+$/, '');
    return Number(frac ? `${whole}.${frac}` : whole);
  }

  async fetchValidatorInfo() {
    try {
      console.log(`Fetching validator ${this.validatorId} info...`);
      const response = await axios.get(this.validatorUrl);
      this.validatorInfo = response.data.result || {};
      return this.validatorInfo;
    } catch (error) {
      console.error(`❌ Error fetching validator info: ${error.message}`);
      return {};
    }
  }

  async fetchUnbonds() {
    try {
      console.log(`Fetching unbonding events...`);
      const response = await axios.get(this.unbondsUrl);
      const events = response.data.result || [];

      this.unbondData = events
        .map(event => {
          try {
            const timestamp = parseInt(event.unbondStartedTimeStamp);
            const eventTime = new Date(timestamp * 1000);
            if (eventTime >= this.cutoffDate) {
              return {
                ...event,
                parsedTime: eventTime,
                amountPol: this.fromWeiToPolNumber(String(event.amount))
              };
            }
            return null;
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .sort((a, b) => a.parsedTime - b.parsedTime);

      console.log(`Found ${this.unbondData.length} unbond events`);
      return this.unbondData;
    } catch (error) {
      console.error(`❌ Error fetching unbonds: ${error.message}`);
      return [];
    }
  }

  async fetchDelegations() {
    console.log(`Fetching delegation events from Ethereum mainnet...`);
    try {
      const ethereumDelegations = await this.ethereumDelegationTracker.fetchDelegationEvents(
        this.validatorId,
        this.monthsBack
      );
      this.delegationData = ethereumDelegations.map(event => ({
        user: event.user,
        delegator: event.user,
        amount: event.amount,
        parsedTime: event.parsedTime,
        amountPol: Number(event.amountPol), // ✅ ensure number
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
        timestamp: event.timestamp,
        source: 'ethereum',
        validatorId: event.validatorId
      }));
      this.delegationData.sort((a, b) => a.parsedTime - b.parsedTime);
      console.log(`Found ${this.delegationData.length} delegation events`);
      return this.delegationData;
    } catch (error) {
      console.error(`❌ Error fetching delegations: ${error.message}`);
      this.delegationData = [];
      return [];
    }
  }

  async filterDelegatorAddresses() {
    console.log(`Filtering delegator addresses...`);
    const allAddresses = new Set();

    this.delegationData.forEach(e => allAddresses.add(e.user || e.delegator));
    this.unbondData.forEach(e => allAddresses.add(e.user));

    const addressArray = Array.from(allAddresses).filter(Boolean);
    if (addressArray.length === 0) return;

    console.log(`Found ${addressArray.length} unique addresses to analyze`);
    this.filterResults = await this.delegatorFilter.filterDelegatorAddresses(addressArray, {
      excludeExchanges: this.filterExchanges,
      excludeDefi: this.filterDefi,
      excludeInstitutional: this.filterInstitutional
    });

    this.filteredDelegators = this.filterResults.individualDelegators.map(i => i.address);
    console.log(`Identified ${this.filteredDelegators.length} individual delegators`);
    this.delegatorFilter.printFilterResults(this.filterResults);
    return this.filterResults;
  }

  analyzeStakeChanges() {
    const addressUnbonds = {};
    const addressDelegations = {};
    const filteredSet = new Set(this.filteredDelegators);

    let totalUnbonded = 0;
    let totalDelegated = 0;
    let unbondEvents = 0;
    let delegationEvents = 0;

    this.unbondData.forEach(e => {
      if (filteredSet.has(e.user)) {
        const amt = Number(e.amountPol) || 0;
        totalUnbonded += amt;
        addressUnbonds[e.user] = (addressUnbonds[e.user] || 0) + amt;
        unbondEvents++;
      }
    });

    this.delegationData.forEach(e => {
      const addr = e.user || e.delegator;
      if (filteredSet.has(addr)) {
        const amt = Number(e.amountPol) || 0;
        totalDelegated += amt;
        addressDelegations[addr] = (addressDelegations[addr] || 0) + amt;
        delegationEvents++;
      }
    });

    const netChange = totalDelegated - totalUnbonded;
    const { currentStake, selfStake, delegatedStake } = this.getStakeBreakdown();

    return {
      totalUnbonded,
      totalDelegated,
      netChange,
      currentStake,
      selfStake,
      delegatedStake,
      addressUnbonds,
      addressDelegations,
      unbondEvents,
      delegationEvents,
      totalUnfilteredUnbonds: this.unbondData.length,
      totalUnfilteredDelegations: this.delegationData.length,
      individualDelegatorsCount: this.filteredDelegators.length
    };
  }

  fromWeiToPolNumber(weiLike) {
    if (typeof weiLike === 'string' && /^0x[0-9a-f]+$/i.test(weiLike)) {
      weiLike = BigInt(weiLike).toString();
    }
    const s = String(weiLike).replace(/^0+/, '') || '0';
    const len = s.length;
    if (len <= 18) {
      return Number(`0.${'0'.repeat(18 - len)}${s}`);
    }
    const whole = s.slice(0, len - 18);
    const frac = s.slice(len - 18).replace(/0+$/, '');
    return Number(frac ? `${whole}.${frac}` : whole);
  }

  parseStakeToPOL(raw) {
    if (raw == null) return 0;
    if (typeof raw === 'bigint') return Number(raw) / 1e18;
    if (typeof raw === 'object' && typeof raw.toString === 'function') {
      const s = raw.toString();
      return /^\d+$/.test(s) ? this.fromWeiToPolNumber(s) : Number(s) || 0;
    }
    if (typeof raw === 'number') return raw >= 1e18 ? raw / 1e18 : raw;
    if (typeof raw === 'string') {
      if (/^0x[0-9a-f]+$/i.test(raw)) return this.fromWeiToPolNumber(BigInt(raw).toString());
      if (/^\d+$/.test(raw)) return this.fromWeiToPolNumber(raw);
      return Number(raw.replace(/,/g, '').replace(/\s*(POL|MATIC)\s*$/i, '')) || 0;
    }
    return 0;
  }

  getStakeBreakdown() {
    const info = this.validatorInfo || {};
    const total = info.totalStaked != null
      ? this.parseStakeToPOL(info.totalStaked)
      : this.getCurrentStake();
    const self = info.selfStake != null ? this.parseStakeToPOL(info.selfStake) : 0;
    const delegated = Math.max(0, total - self);
    return { currentStake: total, selfStake: self, delegatedStake: delegated };
  }

  getCurrentStake() {
    const fields = ['totalStaked', 'totalStake', 'total_stake', 'stake', 'selfStake'];
    for (const key of fields) {
      if (this.validatorInfo[key] != null) return this.parseStakeToPOL(this.validatorInfo[key]);
    }
    return 0;
  }

  getBiggestUnbonds(days = null, limit = 10) {
    let filteredUnbonds = [...this.unbondData];

    // Filter by days if specified
    if (days !== null && days > 0) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      filteredUnbonds = filteredUnbonds.filter(e => e.parsedTime >= cutoffDate);
    }

    // Sort by amount (largest first) and take top N
    return filteredUnbonds
      .sort((a, b) => b.amountPol - a.amountPol)
      .slice(0, limit)
      .map((event, index) => ({
        rank: index + 1,
        address: event.user,
        amount: event.amountPol,
        date: event.parsedTime,
        timestamp: event.unbondStartedTimeStamp,
        nonce: event.nonce
      }));
  }

  async exportData(filename) {
    if (!filename) {
      filename = `validator_${this.validatorId}_data_${format(new Date(), 'yyyyMMdd_HHmmss')}.json`;
    }
    const { currentStake, selfStake, delegatedStake } = this.getStakeBreakdown();
    const exportData = {
      validatorId: this.validatorId,
      monthsBack: this.monthsBack,
      generatedAt: new Date().toISOString(),
      validatorInfo: this.validatorInfo,
      analysis: this.analyzeStakeChanges(),
      currentStake,
      selfStake,
      delegatedStake,
      unbondEvents: this.unbondData,
      delegationEvents: this.delegationData
    };
    await fs.writeJSON(filename, exportData, { spaces: 2 });
    console.log(`📄 Data exported to ${filename}`);
    return filename;
  }

  printAnalysisSummary() {
    const a = this.analyzeStakeChanges();
    console.log(`\nFILTERED RESULTS (Individual Delegators Only):`);
    console.log(`Total Delegated: ${a.totalDelegated.toLocaleString()} POL (${a.delegationEvents} events)`);
    console.log(`Total Unbonded: ${a.totalUnbonded.toLocaleString()} POL (${a.unbondEvents} events)`);
    console.log(`Net Change: ${a.netChange.toLocaleString()} POL`);
    if (a.currentStake > 0) {
      console.log(`Percentage Change: ${((a.netChange / a.currentStake) * 100).toFixed(4)}%`);
    }
    return a;
  }

  async runFullAnalysis() {
    await this.fetchValidatorInfo();
    await this.fetchUnbonds();
    await this.fetchDelegations();
    await this.filterDelegatorAddresses();
    const analysis = this.printAnalysisSummary();
    await this.exportData();
    return analysis;
  }
}

module.exports = ValidatorTracker;
