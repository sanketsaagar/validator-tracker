const axios = require('axios');
const fs = require('fs-extra');
const { format } = require('date-fns');

class FundFlowTracker {
    constructor() {
        // API configurations - set these as environment variables
        this.polygonscanApiKey = process.env.POLYGONSCAN_API_KEY || 'YourApiKeyToken';
        this.etherscanApiKey = process.env.ETHERSCAN_API_KEY || 'YourApiKeyToken';
        this.arkhamApiKey = process.env.ARKHAM_API_KEY || 'your_arkham_api_key';
        
        // API endpoints
        this.arkhamBaseUrl = 'https://api.arkhamintelligence.com';
        
        // Known addresses for classification (fallback)
        this.knownAddresses = this.loadKnownAddresses();
        
        // Cache for API results to avoid duplicate API calls
        this.addressLabelCache = new Map();
        
        // Rate limiting
        this.requestDelay = 200; // ms between requests
        this.arkhamDelay = 250; // Rate limiting for Arkham API
    }

    loadKnownAddresses() {
        return {
            // Major exchanges
            '0x5e3346444010135322268a0ca24b70e5b1d0d52a': { type: 'exchange', name: 'Binance' },
            '0x6cc5f688a315f3dc28a7781717a9a798a59fda7b': { type: 'exchange', name: 'OKX' },
            '0x46340b20830761efd32832a74d7169b29feb9758': { type: 'exchange', name: 'Crypto.com' },
            
            // DeFi protocols
            '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063': { type: 'defi', name: 'Aave POL' },
            '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270': { type: 'defi', name: 'WPOL' },
            
            // Polygon validators
            '0x9fb29aac15b9a4b7f17c3385939b007540f4d791': { type: 'validator', name: 'Polygon Validator' }
        };
    }

    async classifyAddress(address) {
        const addressLower = address.toLowerCase();
        
        // First check local cache
        if (this.addressLabelCache.has(addressLower)) {
            return this.addressLabelCache.get(addressLower);
        }
        
        // Check known addresses (fallback)
        if (this.knownAddresses[addressLower]) {
            const info = this.knownAddresses[addressLower];
            const result = { type: info.type, name: info.name, source: 'local' };
            this.addressLabelCache.set(addressLower, result);
            return result;
        }
        
        // Try Arkham Intelligence API (recommended)  
        if (this.arkhamApiKey && this.arkhamApiKey !== 'your_arkham_api_key') {
            try {
                const arkhamResult = await this.getArkhamLabel(address);
                if (arkhamResult) {
                    this.addressLabelCache.set(addressLower, arkhamResult);
                    return arkhamResult;
                }
            } catch (error) {
                console.warn(`⚠️  Arkham API error for ${address}: ${error.message}`);
            }
        }
        
        // Default classification
        const defaultResult = { type: 'unknown', name: `Unknown_${address.slice(0, 8)}...`, source: 'default' };
        this.addressLabelCache.set(addressLower, defaultResult);
        return defaultResult;
    }

    async getArkhamLabel(address) {
        try {
            // Arkham Intelligence API for address labeling
            const url = `${this.arkhamBaseUrl}/v1/address/${address.toLowerCase()}`;
            const headers = {
                'Authorization': `Bearer ${this.arkhamApiKey}`,
                'Content-Type': 'application/json'
            };
            
            console.log(`🔍 Querying Arkham Intelligence for ${address.slice(0, 8)}...`);
            
            const response = await axios.get(url, { 
                headers, 
                timeout: 10000 
            });
            
            if (response.data && response.data.entity) {
                const data = response.data;
                const entity = data.entity;
                
                // Classify based on Arkham response
                const classification = this.classifyFromArkham(entity);
                
                return {
                    type: classification.type,
                    name: entity.name || `${address.slice(0, 8)}...`,
                    entity: entity.name,
                    entityType: entity.type,
                    source: 'arkham',
                    confidence: 'high',
                    rawData: data
                };
            }
            
            // Add delay for rate limiting
            await this.sleep(this.arkhamDelay);
            
            return null;
            
        } catch (error) {
            if (error.response?.status === 429) {
                console.warn(`⚠️  Arkham rate limit hit for ${address}`);
                await this.sleep(1000); // Wait longer on rate limit
            } else if (error.response?.status === 401) {
                console.warn(`⚠️  Arkham authentication failed - check API key`);
            } else if (error.response?.status === 404) {
                // Address not found in Arkham database - not an error
                return null;
            }
            throw error;
        }
    }

    classifyFromArkham(entity) {
        const entityType = (entity.type || '').toLowerCase();
        const entityName = (entity.name || '').toLowerCase();
        
        // Classification based on Arkham entity types
        if (entityType.includes('exchange') || entityName.includes('exchange') ||
            ['binance', 'coinbase', 'okx', 'kraken', 'huobi', 'bybit', 'kucoin'].some(ex => 
                entityType.includes(ex) || entityName.includes(ex))) {
            return { type: 'exchange' };
        }
        
        if (entityType.includes('validator') || entityName.includes('validator') || entityName.includes('staking')) {
            return { type: 'validator' };
        }
        
        if (entityType.includes('defi') || entityType.includes('protocol') || 
            ['uniswap', 'aave', 'compound', 'balancer', 'curve'].some(defi => 
                entityType.includes(defi) || entityName.includes(defi))) {
            return { type: 'defi' };
        }
        
        if (entityType.includes('bridge') || entityName.includes('bridge')) {
            return { type: 'bridge' };
        }
        
        if (entityType.includes('contract') || entityType.includes('token')) {
            return { type: 'contract' };
        }
        
        if (entityType.includes('mixer') || entityName.includes('tornado') || entityName.includes('mixer')) {
            return { type: 'mixer' };
        }
        
        // Default to wallet if we have an entity but can't classify
        return { type: 'wallet' };
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async getPolygonTransactions(address, threshold = 10.0) {
        try {
            const url = 'https://api.polygonscan.com/api';
            const params = {
                module: 'account',
                action: 'txlist',
                address: address,
                startblock: 0,
                endblock: 99999999,
                page: 1,
                offset: 100,
                sort: 'desc',
                apikey: this.polygonscanApiKey
            };

            const response = await axios.get(url, { params, timeout: 10000 });
            const data = response.data;

            const movements = [];
            
            if (data.status === '1' && data.result) {
                for (const tx of data.result) {
                    if (tx.from.toLowerCase() === address.toLowerCase() && 
                        parseFloat(tx.value) / 1e18 >= threshold) {
                        
                        const classification = await this.classifyAddress(tx.to);
                        
                        movements.push({
                            fromAddress: tx.from,
                            toAddress: tx.to,
                            amount: parseFloat(tx.value) / 1e18,
                            timestamp: new Date(parseInt(tx.timeStamp) * 1000),
                            txHash: tx.hash,
                            movementType: classification.type,
                            destinationName: classification.name,
                            destinationSource: classification.source,
                            metaSleuthData: classification.rawData || null
                        });
                    }
                }
            }
            
            return movements;
        } catch (error) {
            console.warn(`⚠️  PolygonScan API error for ${address}: ${error.message}`);
            return [];
        }
    }

    async trackAddressOutflows(address, amountThreshold = 10.0) {
        console.log(`Tracking outflows for ${address.slice(0, 8)}...`);
        
        let movements = [];
        
        try {
            // Try Polygon transactions first
            movements = await this.getPolygonTransactions(address, amountThreshold);
            
            // Also get Ethereum transactions if Etherscan API key is available
            if (this.etherscanApiKey && this.etherscanApiKey !== 'YourApiKeyToken') {
                const ethereumMovements = await this.getEthereumTransactions(address, amountThreshold);
                movements = movements.concat(ethereumMovements);
            }
            
            await this.sleep(this.requestDelay);
        } catch (error) {
            console.error(`❌ Error tracking flows for ${address}: ${error.message}`);
        }
        
        return movements;
    }

    async getEthereumTransactions(address, threshold = 10.0) {
        try {
            const url = 'https://api.etherscan.io/api';
            const params = {
                module: 'account',
                action: 'txlist',
                address: address,
                startblock: 0,
                endblock: 99999999,
                page: 1,
                offset: 50,
                sort: 'desc',
                apikey: this.etherscanApiKey
            };

            const response = await axios.get(url, { params, timeout: 10000 });
            const data = response.data;

            const movements = [];
            
            if (data.status === '1' && data.result) {
                for (const tx of data.result) {
                    if (tx.from.toLowerCase() === address.toLowerCase() && 
                        parseFloat(tx.value) / 1e18 >= threshold) {
                        
                        const classification = await this.classifyAddress(tx.to);
                        
                        movements.push({
                            fromAddress: tx.from,
                            toAddress: tx.to,
                            amount: parseFloat(tx.value) / 1e18,
                            timestamp: new Date(parseInt(tx.timeStamp) * 1000),
                            txHash: tx.hash,
                            movementType: classification.type,
                            destinationName: classification.name,
                            destinationSource: classification.source,
                            metaSleuthData: classification.rawData || null,
                            chain: 'ethereum'
                        });
                    }
                }
            }
            
            return movements;
        } catch (error) {
            console.warn(`⚠️  Etherscan API error for ${address}: ${error.message}`);
            return [];
        }
    }

    analyzeFundDestinations(movements) {
        const analysis = {
            totalTracked: movements.reduce((sum, m) => sum + m.amount, 0),
            destinationTypes: {},
            majorRecipients: {},
            riskAssessment: ''
        };

        movements.forEach(movement => {
            const destType = movement.movementType;
            
            if (!analysis.destinationTypes[destType]) {
                analysis.destinationTypes[destType] = { count: 0, amount: 0 };
            }
            
            analysis.destinationTypes[destType].count += 1;
            analysis.destinationTypes[destType].amount += movement.amount;
            
            if (!analysis.majorRecipients[movement.toAddress]) {
                analysis.majorRecipients[movement.toAddress] = {
                    amount: 0,
                    count: 0,
                    type: destType,
                    name: movement.destinationName
                };
            }
            
            analysis.majorRecipients[movement.toAddress].amount += movement.amount;
            analysis.majorRecipients[movement.toAddress].count += 1;
        });

        const exchangePct = analysis.totalTracked > 0 ? 
            (analysis.destinationTypes?.exchange?.amount || 0) / analysis.totalTracked * 100 : 0;
        
        if (exchangePct > 70) {
            analysis.riskAssessment = 'HIGH - Majority going to exchanges (possible sell pressure)';
        } else if (exchangePct > 40) {
            analysis.riskAssessment = 'MEDIUM - Significant exchange deposits';
        } else {
            analysis.riskAssessment = 'LOW - Funds mostly staying in DeFi/wallets';
        }

        return analysis;
    }

    async generateFlowReport(unbonderAddresses, outputFile) {
        if (!outputFile) {
            outputFile = `fund_flow_report_${format(new Date(), 'yyyyMMdd_HHmmss')}.json`;
        }

        console.log(`Analyzing fund flows for ${unbonderAddresses.length} addresses...`);
        
        const fullReport = {
            analysisTimestamp: new Date().toISOString(),
            addressesAnalyzed: unbonderAddresses.length,
            individualFlows: {},
            aggregateAnalysis: {},
            recommendations: []
        };

        const allMovements = [];
        const maxAddresses = Math.min(unbonderAddresses.length, 10);

        for (let i = 0; i < maxAddresses; i++) {
            const address = unbonderAddresses[i];
            console.log(`  Analyzing ${i + 1}/${maxAddresses}: ${address.slice(0, 8)}...`);
            
            const movements = await this.trackAddressOutflows(address);
            allMovements.push(...movements);
            
            if (movements.length > 0) {
                const individualAnalysis = this.analyzeFundDestinations(movements);
                
                fullReport.individualFlows[address] = {
                    movements: movements.map(m => ({
                        to: m.toAddress,
                        toName: m.destinationName,
                        amount: m.amount,
                        type: m.movementType,
                        timestamp: m.timestamp.toISOString(),
                        txHash: m.txHash,
                        dataSource: m.destinationSource,
                        metaSleuthLabel: m.metaSleuthData ? {
                            nameTag: m.metaSleuthData.name_tag,
                            mainEntity: m.metaSleuthData.main_entity
                        } : null
                    })),
                    analysis: individualAnalysis
                };
            }
            
            await this.sleep(this.requestDelay);
        }

        if (allMovements.length > 0) {
            fullReport.aggregateAnalysis = this.analyzeFundDestinations(allMovements);
            
            const aggregate = fullReport.aggregateAnalysis;
            const recommendations = [];
            
            const exchangePct = aggregate.totalTracked > 0 ? 
                (aggregate.destinationTypes?.exchange?.amount || 0) / aggregate.totalTracked * 100 : 0;
            
            if (exchangePct > 50) {
                recommendations.push('Monitor for potential sell pressure - high exchange deposit activity');
            }
            
            const defiPct = aggregate.totalTracked > 0 ? 
                (aggregate.destinationTypes?.defi?.amount || 0) / aggregate.totalTracked * 100 : 0;
            
            if (defiPct > 30) {
                recommendations.push('Positive: Significant DeFi activity suggests continued ecosystem participation');
            }
            
            fullReport.recommendations = recommendations;
        }

        await fs.writeJSON(outputFile, fullReport, { spaces: 2 });
        console.log(`Fund flow report saved to ${outputFile}`);
        
        return fullReport;
    }

    printFlowSummary(report) {
        console.log('\n' + '='.repeat(60));
        console.log('💸 FUND FLOW ANALYSIS SUMMARY');
        console.log('='.repeat(60));

        if (report.aggregateAnalysis && Object.keys(report.aggregateAnalysis).length > 0) {
            const agg = report.aggregateAnalysis;
            
            console.log(`Total Tracked Outflows: ${agg.totalTracked.toLocaleString()} POL`);
            console.log(`Risk Assessment: ${agg.riskAssessment}`);
            
            console.log('\n📊 Destination Breakdown:');
            Object.entries(agg.destinationTypes).forEach(([destType, data]) => {
                const pct = agg.totalTracked > 0 ? (data.amount / agg.totalTracked) * 100 : 0;
                console.log(`  ${destType.charAt(0).toUpperCase() + destType.slice(1)}: ${data.amount.toLocaleString()} POL (${pct.toFixed(1)}%) - ${data.count} transactions`);
            });
            
            console.log('\n🏆 Top Recipients:');
            const sortedRecipients = Object.entries(agg.majorRecipients)
                .sort(([,a], [,b]) => b.amount - a.amount)
                .slice(0, 5);
            
            sortedRecipients.forEach(([addr, data], index) => {
                console.log(`  ${index + 1}. ${data.name || `${addr.slice(0, 8)}...`} (${data.type}): ${data.amount.toLocaleString()} POL`);
            });
        }

        // Show MetaSleuth statistics
        this.printMetaSleuthStats(report);

        if (report.recommendations && report.recommendations.length > 0) {
            console.log('\n💡 Recommendations:');
            report.recommendations.forEach((rec, index) => {
                console.log(`  ${index + 1}. ${rec}`);
            });
        }
    }

    printMetaSleuthStats(report) {
        let metaSleuthCount = 0;
        let localCount = 0;
        let unknownCount = 0;
        
        Object.values(report.individualFlows || {}).forEach(flow => {
            flow.movements.forEach(movement => {
                if (movement.dataSource === 'metasleuth') metaSleuthCount++;
                else if (movement.dataSource === 'local') localCount++;
                else unknownCount++;
            });
        });
        
        const total = metaSleuthCount + localCount + unknownCount;
        
        if (total > 0) {
            console.log('\n🔍 Address Classification Sources:');
            console.log(`  MetaSleuth API: ${metaSleuthCount} addresses (${((metaSleuthCount/total)*100).toFixed(1)}%)`);
            console.log(`  Local Database: ${localCount} addresses (${((localCount/total)*100).toFixed(1)}%)`);
            console.log(`  Unknown: ${unknownCount} addresses (${((unknownCount/total)*100).toFixed(1)}%)`);
            
            if (metaSleuthCount > 0) {
                console.log('  ✅ Enhanced labeling active with MetaSleuth');
            } else if (this.metasleuthApiKey === 'your_metasleuth_api_key') {
                console.log('  ⚠️  Set METASLEUTH_API_KEY for enhanced address labeling');
            }
        }
    }

    generateArkhamVisualizationUrls(delegatorAddresses) {
        const arkhamUrls = [];
        
        console.log('\nARKHAM INTELLIGENCE FUND FLOW URLS:');
        console.log('Use these URLs for visual fund flow analysis:');
        
        delegatorAddresses.forEach((address, index) => {
            const arkhamUrl = `https://platform.arkhamintelligence.com/explorer/address/${address}`;
            arkhamUrls.push({
                address: address,
                url: arkhamUrl,
                description: `Arkham fund flow analysis for ${address.slice(0, 8)}...`
            });
            
            console.log(`${(index + 1).toString().padStart(2)}. ${address}: ${arkhamUrl}`);
        });
        
        return arkhamUrls;
    }
    
    generateEtherscanUrls(delegatorAddresses) {
        const etherscanUrls = [];
        
        console.log('\nETHERSCAN ANALYSIS URLS:');
        console.log('Basic transaction analysis:');
        
        delegatorAddresses.slice(0, 5).forEach((address, index) => {
            const etherscanUrl = `https://etherscan.io/address/${address}`;
            etherscanUrls.push({
                address: address,
                url: etherscanUrl,
                description: `Etherscan transaction history for ${address.slice(0, 8)}...`
            });
            
            console.log(`${(index + 1).toString().padStart(2)}. ${address}: ${etherscanUrl}`);
        });
        
        return etherscanUrls;
    }

    async generateUnbondVisualizationUrls(unbondAddresses, outputFile) {
        console.log(`Generating fund flow visualizations for ${unbondAddresses.length} unbond wallet addresses...`);
        
        if (!outputFile) {
            outputFile = `unbond_visualizations_${format(new Date(), 'yyyyMMdd_HHmmss')}.json`;
        }

        // Generate visualization options for unbond addresses
        const visualizationReport = {
            generatedAt: new Date().toISOString(),
            addressCount: unbondAddresses.length,
            arkhamUrls: this.generateArkhamVisualizationUrls(unbondAddresses),
            etherscanUrls: this.generateEtherscanUrls(unbondAddresses)
        };

        // Save the report
        await fs.writeJSON(outputFile, visualizationReport, { spaces: 2 });
        console.log(`Unbond wallet visualization report saved to ${outputFile}`);

        return visualizationReport;
    }

    async trackDelegatorFundFlows(unbondAddresses, options = {}) {
        console.log(`Fund flow analysis for ${unbondAddresses.length} unbond wallets...`);
        
        const {
            includeVisualizations = true,
            amountThreshold = 1.0,
            outputFilePrefix = 'unbond_analysis'
        } = options;

        const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
        
        // 1. Generate fund flow report for unbond addresses only
        console.log('\nStep 1: Analyzing transaction patterns for unbond wallets...');
        const fundFlowReport = await this.generateFlowReport(
            unbondAddresses,
            `${outputFilePrefix}_flows_${timestamp}.json`
        );

        let visualizationReport = null;
        
        // 2. Generate visualizations if requested
        if (includeVisualizations) {
            console.log('\nStep 2: Creating fund flow visualizations for unbond wallets...');
            visualizationReport = await this.generateUnbondVisualizationUrls(
                unbondAddresses,
                `${outputFilePrefix}_visualizations_${timestamp}.json`
            );
        }

        // 3. Create combined analysis report
        const combinedReport = {
            analysisMetadata: {
                generatedAt: new Date().toISOString(),
                unbondWalletCount: unbondAddresses.length,
                includesVisualizations: includeVisualizations,
                amountThreshold: amountThreshold
            },
            unbondAddresses: unbondAddresses,
            fundFlowAnalysis: fundFlowReport,
            visualizationAnalysis: visualizationReport,
            actionableInsights: this.generateActionableInsights(fundFlowReport, visualizationReport)
        };

        const combinedOutputFile = `${outputFilePrefix}_complete_${timestamp}.json`;
        await fs.writeJSON(combinedOutputFile, combinedReport, { spaces: 2 });
        
        console.log(`\nUNBOND WALLET ANALYSIS SUMMARY`);
        console.log('='.repeat(60));
        console.log(`Unbond Addresses Analyzed: ${unbondAddresses.length}`);
        console.log(`Fund Flow Report: ${fundFlowReport ? 'Generated' : 'Failed'}`);
        console.log(`Visual Analysis: ${visualizationReport ? 'Generated' : 'Skipped'}`);
        console.log(`Combined Report: ${combinedOutputFile}`);
        
        if (visualizationReport && visualizationReport.arkhamUrls && visualizationReport.arkhamUrls.length > 0) {
            console.log(`\nArkham URLs Generated: ${visualizationReport.arkhamUrls.length}`);
            console.log('Use these URLs for visual fund flow analysis in your browser.');
        }

        return combinedReport;
    }

    generateActionableInsights(fundFlowReport, visualizationReport) {
        const insights = [];
        
        if (fundFlowReport && fundFlowReport.aggregateAnalysis) {
            const agg = fundFlowReport.aggregateAnalysis;
            
            // Exchange activity insights
            const exchangePct = agg.totalTracked > 0 ? 
                (agg.destinationTypes?.exchange?.amount || 0) / agg.totalTracked * 100 : 0;
            
            if (exchangePct > 70) {
                insights.push({
                    type: 'high-risk',
                    category: 'sell-pressure',
                    message: `${exchangePct.toFixed(1)}% of delegator outflows go to exchanges - potential sell pressure risk`,
                    recommendation: 'Monitor for coordinated selling activity'
                });
            } else if (exchangePct > 40) {
                insights.push({
                    type: 'medium-risk',
                    category: 'sell-pressure',
                    message: `${exchangePct.toFixed(1)}% of delegator outflows go to exchanges`,
                    recommendation: 'Watch for trends in exchange deposits'
                });
            }
            
            // DeFi activity insights
            const defiPct = agg.totalTracked > 0 ? 
                (agg.destinationTypes?.defi?.amount || 0) / agg.totalTracked * 100 : 0;
            
            if (defiPct > 30) {
                insights.push({
                    type: 'positive',
                    category: 'ecosystem-health',
                    message: `${defiPct.toFixed(1)}% of delegator funds flow to DeFi protocols`,
                    recommendation: 'Good sign of continued ecosystem participation'
                });
            }
        }

        if (visualizationReport && visualizationReport.visualizationSummary) {
            const vizSummary = visualizationReport.visualizationSummary;
            
            if (vizSummary.withLabels > 0) {
                insights.push({
                    type: 'informational',
                    category: 'data-quality',
                    message: `${vizSummary.withLabels} addresses have MetaSleuth labels for enhanced analysis`,
                    recommendation: 'Focus on labeled addresses for deeper investigation'
                });
            }
            
            if (vizSummary.withoutLabels > vizSummary.withLabels) {
                insights.push({
                    type: 'informational',
                    category: 'data-quality',
                    message: `${vizSummary.withoutLabels} addresses lack detailed labels`,
                    recommendation: 'Manual investigation may be needed for unlabeled addresses'
                });
            }
        }

        return insights;
    }
}

module.exports = FundFlowTracker;
