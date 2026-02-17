const axios = require('axios');
const fs = require('fs-extra');
const { format } = require('date-fns');

class MetaSleuthVisualizer {
    constructor() {
        this.metasleuthApiKey = process.env.METASLEUTH_API_KEY || 'your_metasleuth_api_key';
        this.metasleuthBaseUrl = 'https://api.metasleuth.io';
        
        // Cache for visualization data
        this.visualizationCache = new Map();
        
        // Rate limiting
        this.requestDelay = 250; // 4 requests per second max
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async createVisualizationForAddress(address, options = {}) {
        const {
            maxDepth = 2,
            includeTokens = true,
            timeRange = '30d',
            chainId = 1 // Ethereum mainnet
        } = options;

        console.log(`🔍 Creating MetaSleuth visualization for ${address.slice(0, 8)}...`);

        if (!this.metasleuthApiKey || this.metasleuthApiKey === 'your_metasleuth_api_key') {
            console.warn('⚠️  MetaSleuth API key not configured. Skipping visualization.');
            return null;
        }

        try {
            // First, get address information
            const addressInfo = await this.getAddressInfo(address, chainId);
            if (!addressInfo) {
                console.warn(`⚠️  Could not get address info for ${address.slice(0, 8)}`);
                return null;
            }

            // Create fund flow visualization
            const fundFlowData = await this.getFundFlowData(address, chainId, {
                maxDepth,
                timeRange,
                includeTokens
            });

            // Generate visualization URL and metadata
            const visualization = {
                address: address,
                chainId: chainId,
                addressInfo: addressInfo,
                fundFlowData: fundFlowData,
                metaSleuthUrl: this.generateMetaSleuthUrl(address, chainId),
                generatedAt: new Date().toISOString(),
                options: { maxDepth, includeTokens, timeRange }
            };

            // Cache the result
            this.visualizationCache.set(address.toLowerCase(), visualization);

            console.log(`✅ Visualization created for ${address.slice(0, 8)}`);
            console.log(`   MetaSleuth URL: ${visualization.metaSleuthUrl}`);

            await this.sleep(this.requestDelay);
            return visualization;

        } catch (error) {
            console.error(`❌ Error creating visualization for ${address.slice(0, 8)}: ${error.message}`);
            return null;
        }
    }

    async getAddressInfo(address, chainId) {
        try {
            const url = `${this.metasleuthBaseUrl}/v1/address-label`;
            const headers = {
                'Authorization': `Bearer ${this.metasleuthApiKey}`,
                'Content-Type': 'application/json'
            };
            
            const requestBody = {
                chain_id: chainId,
                address: address.toLowerCase()
            };
            
            const response = await axios.post(url, requestBody, { 
                headers, 
                timeout: 10000 
            });
            
            if (response.data) {
                return {
                    nameTag: response.data.name_tag,
                    mainEntity: response.data.main_entity,
                    labels: response.data.labels || [],
                    riskScore: response.data.risk_score,
                    confidence: response.data.confidence
                };
            }
            
            return null;
            
        } catch (error) {
            if (error.response?.status === 429) {
                console.warn(`⚠️  MetaSleuth rate limit for ${address.slice(0, 8)}`);
                await this.sleep(1000);
            }
            throw error;
        }
    }

    async getFundFlowData(address, chainId, options) {
        // This would typically call MetaSleuth's fund flow API
        // For now, we'll create a placeholder structure
        try {
            const url = `${this.metasleuthBaseUrl}/v1/fund-flow`;
            const headers = {
                'Authorization': `Bearer ${this.metasleuthApiKey}`,
                'Content-Type': 'application/json'
            };
            
            const requestBody = {
                chain_id: chainId,
                address: address.toLowerCase(),
                max_depth: options.maxDepth,
                time_range: options.timeRange,
                include_tokens: options.includeTokens
            };
            
            // Note: This endpoint might not exist in the actual MetaSleuth API
            // This is a conceptual implementation for fund flow visualization
            try {
                const response = await axios.post(url, requestBody, { 
                    headers, 
                    timeout: 15000 
                });
                
                return response.data;
            } catch (apiError) {
                // If the fund flow API doesn't exist, return basic structure
                console.warn(`⚠️  Fund flow API not available, using basic structure`);
                return {
                    nodes: [
                        {
                            address: address,
                            type: 'source',
                            balance: 'Unknown',
                            labels: []
                        }
                    ],
                    edges: [],
                    summary: {
                        totalOutflow: 0,
                        totalInflow: 0,
                        uniqueDestinations: 0
                    }
                };
            }
            
        } catch (error) {
            console.warn(`⚠️  Error fetching fund flow data: ${error.message}`);
            return null;
        }
    }

    generateMetaSleuthUrl(address, chainId = 1) {
        // Generate direct link to MetaSleuth for visual analysis
        const chainName = this.getChainName(chainId);
        return `https://metasleuth.io/result/${chainName}/${address.toLowerCase()}?utm_source=validator-stake-tracker`;
    }

    getChainName(chainId) {
        const chainNames = {
            1: 'eth',
            137: 'polygon',
            56: 'bsc',
            10: 'optimism',
            42161: 'arbitrum'
        };
        return chainNames[chainId] || 'eth';
    }

    async createBatchVisualizations(addresses, options = {}) {
        const {
            maxConcurrency = 3,
            progressCallback = null,
            chainId = 1
        } = options;

        console.log(`🎨 Creating MetaSleuth visualizations for ${addresses.length} addresses...`);
        
        const results = {
            successful: [],
            failed: [],
            metaSleuthUrls: [],
            visualizationSummary: {
                totalAddresses: addresses.length,
                successful: 0,
                failed: 0,
                withLabels: 0,
                withoutLabels: 0
            }
        };

        // Process addresses in batches
        const batchSize = Math.min(maxConcurrency, 5);
        const batches = [];
        
        for (let i = 0; i < addresses.length; i += batchSize) {
            batches.push(addresses.slice(i, i + batchSize));
        }

        let processed = 0;

        for (const batch of batches) {
            const batchPromises = batch.map(async (address) => {
                try {
                    const visualization = await this.createVisualizationForAddress(address, options);
                    
                    processed++;
                    if (progressCallback) {
                        progressCallback(processed, addresses.length);
                    }

                    if (visualization) {
                        results.successful.push(visualization);
                        results.metaSleuthUrls.push(visualization.metaSleuthUrl);
                        results.visualizationSummary.successful++;
                        
                        if (visualization.addressInfo && visualization.addressInfo.nameTag) {
                            results.visualizationSummary.withLabels++;
                        } else {
                            results.visualizationSummary.withoutLabels++;
                        }
                    } else {
                        results.failed.push(address);
                        results.visualizationSummary.failed++;
                    }

                    return { address, visualization };
                } catch (error) {
                    console.error(`❌ Batch visualization error for ${address.slice(0, 8)}: ${error.message}`);
                    results.failed.push(address);
                    results.visualizationSummary.failed++;
                    return { address, visualization: null, error: error.message };
                }
            });

            await Promise.all(batchPromises);
            
            // Delay between batches to respect rate limits
            if (batches.indexOf(batch) < batches.length - 1) {
                await this.sleep(500);
            }
        }

        console.log(`✅ Batch visualization complete: ${results.visualizationSummary.successful}/${addresses.length} successful`);
        
        return results;
    }

    async generateVisualizationReport(addresses, outputFile, options = {}) {
        const batchResults = await this.createBatchVisualizations(addresses, {
            ...options,
            progressCallback: (processed, total) => {
                if (processed % 5 === 0 || processed === total) {
                    console.log(`   Progress: ${processed}/${total} visualizations created`);
                }
            }
        });

        if (!outputFile) {
            outputFile = `metasleuth_visualization_report_${format(new Date(), 'yyyyMMdd_HHmmss')}.json`;
        }

        const report = {
            reportMetadata: {
                generatedAt: new Date().toISOString(),
                totalAddresses: addresses.length,
                metaSleuthApiUsed: this.metasleuthApiKey !== 'your_metasleuth_api_key',
                chainId: options.chainId || 1
            },
            visualizationSummary: batchResults.visualizationSummary,
            metaSleuthUrls: batchResults.metaSleuthUrls,
            addressVisualizations: batchResults.successful,
            failedAddresses: batchResults.failed,
            instructions: {
                howToUse: "Open the MetaSleuth URLs in your browser for visual fund flow analysis",
                visualAnalysis: "Each URL provides an interactive graph showing fund flows and address connections",
                recommendation: "Focus on addresses with high-value outflows to exchanges or suspicious patterns"
            }
        };

        await fs.writeJSON(outputFile, report, { spaces: 2 });
        console.log(`📄 MetaSleuth visualization report saved to ${outputFile}`);

        this.printVisualizationSummary(report);
        
        return report;
    }

    printVisualizationSummary(report) {
        console.log('\n🎨 METASLEUTH VISUALIZATION SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total Addresses: ${report.visualizationSummary.totalAddresses}`);
        console.log(`Successful Visualizations: ${report.visualizationSummary.successful}`);
        console.log(`Failed: ${report.visualizationSummary.failed}`);
        console.log(`Addresses with Labels: ${report.visualizationSummary.withLabels}`);
        console.log(`Addresses without Labels: ${report.visualizationSummary.withoutLabels}`);
        
        if (report.metaSleuthUrls.length > 0) {
            console.log('\n🔗 METASLEUTH VISUALIZATION LINKS:');
            console.log('Open these URLs in your browser for interactive fund flow analysis:');
            report.metaSleuthUrls.slice(0, 10).forEach((url, index) => {
                console.log(`${(index + 1).toString().padStart(2)}. ${url}`);
            });
            
            if (report.metaSleuthUrls.length > 10) {
                console.log(`   ... and ${report.metaSleuthUrls.length - 10} more URLs in the report file`);
            }
        }

        console.log('\n💡 ANALYSIS RECOMMENDATIONS:');
        console.log('1. Open MetaSleuth URLs to see visual fund flow graphs');
        console.log('2. Look for connections to exchanges, mixers, or suspicious addresses');
        console.log('3. Analyze transaction patterns and timing');
        console.log('4. Check for unusual concentration of funds to specific destinations');
        
        if (!report.reportMetadata.metaSleuthApiUsed) {
            console.log('\n⚠️  SET METASLEUTH_API_KEY for enhanced labeling and analysis');
        }
    }

    // Method to get cached visualization data
    getCachedVisualization(address) {
        return this.visualizationCache.get(address.toLowerCase());
    }

    // Method to clear cache
    clearCache() {
        this.visualizationCache.clear();
    }
}

module.exports = MetaSleuthVisualizer;