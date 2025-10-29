// Load environment variables from .env file if it exists
require('dotenv').config();

const ValidatorTracker = require('./ValidatorTracker');
const ChartGenerator = require('./ChartGenerator');
const FundFlowTracker = require('./FundFlowTracker');
const DelegatorFilter = require('./DelegatorFilter');
const MetaSleuthVisualizer = require('./MetaSleuthVisualizer');
const EthereumDelegationTracker = require('./EthereumDelegationTracker');

// Main entry point for programmatic usage - now focused on individual delegators
class ValidatorStakeTracker {
    constructor(validatorId, options = {}) {
        this.validatorId = validatorId;
        this.options = {
            months: 6,
            generateCharts: true,
            exportData: true,
            outputDir: './output',
            fundFlowThreshold: 1,
            filterExchanges: true,
            filterDefi: true,
            filterInstitutional: true,
            includeVisualizations: false,
            maxDelegatorAddresses: 20,
            ...options
        };
        
        this.tracker = new ValidatorTracker(validatorId, this.options.months, {
            filterExchanges: this.options.filterExchanges,
            filterDefi: this.options.filterDefi,
            filterInstitutional: this.options.filterInstitutional
        });
        this.chartGenerator = new ChartGenerator();
        this.flowTracker = new FundFlowTracker();
        this.delegatorFilter = new DelegatorFilter();
        this.visualizer = new MetaSleuthVisualizer();
    }

    async runCompleteAnalysis() {
        console.log(`🚀 Starting complete individual delegator analysis for Validator ${this.validatorId}...`);
        console.log(`🎯 Focus: Individual delegators only (filtering out exchanges/DeFi)`);
        
        try {
            // Step 1: Validator analysis with delegator filtering
            const analysis = await this.tracker.runFullAnalysis();
            
            // Step 2: Generate visualizations
            if (this.options.generateCharts) {
                console.log('\n📊 Generating charts...');
                await this.chartGenerator.generateAllCharts(
                    this.tracker, 
                    `${this.options.outputDir}/charts`
                );
            }
            
            // Step 3: Individual delegator fund flow analysis
            const delegatorAddresses = this.tracker.getIndividualDelegatorAddresses();
            let delegatorReport = null;
            let visualizationReport = null;
            
            if (delegatorAddresses.length > 0) {
                console.log(`\n💰 Analyzing fund flows for ${delegatorAddresses.length} individual delegators...`);
                
                // Limit addresses to avoid overwhelming APIs
                const addressesToAnalyze = delegatorAddresses.slice(0, this.options.maxDelegatorAddresses);
                
                // Generate comprehensive delegator analysis
                delegatorReport = await this.flowTracker.trackDelegatorFundFlows(addressesToAnalyze, {
                    includeVisualizations: this.options.includeVisualizations,
                    amountThreshold: this.options.fundFlowThreshold,
                    outputFilePrefix: `${this.options.outputDir}/delegator_analysis`
                });
                
                console.log(`\n📋 INDIVIDUAL DELEGATOR ADDRESSES FOR METASLEUTH:`);
                console.log('Copy these addresses to MetaSleuth for visual fund flow analysis:');
                addressesToAnalyze.slice(0, 10).forEach((address, index) => {
                    console.log(`${(index + 1).toString().padStart(2)}. ${address}`);
                });
                
                if (addressesToAnalyze.length > 10) {
                    console.log(`   ... and ${addressesToAnalyze.length - 10} more addresses available`);
                }
                
                console.log('\n🔗 MetaSleuth Integration:');
                console.log('• Go to https://metasleuth.io');
                console.log('• Enter each address for visual fund flow analysis');
                console.log('• Look for connections to exchanges, mixers, or suspicious addresses');
                
            } else {
                console.log('\n📝 No individual delegator addresses found');
            }
            
            console.log('\n✅ Complete individual delegator analysis finished!');
            
            return {
                validatorAnalysis: analysis,
                delegatorAddresses: delegatorAddresses,
                delegatorReport: delegatorReport,
                visualizationReport: visualizationReport,
                filterResults: this.tracker.getFilterResults(),
                outputDirectory: this.options.outputDir
            };
            
        } catch (error) {
            console.error(`❌ Error during analysis: ${error.message}`);
            throw error;
        }
    }

    async getBasicAnalysis() {
        return await this.tracker.runFullAnalysis();
    }

    async generateCharts() {
        return await this.chartGenerator.generateAllCharts(
            this.tracker,
            `${this.options.outputDir}/charts`
        );
    }

    async analyzeFundFlows(addresses) {
        return await this.flowTracker.generateFlowReport(
            addresses,
            `${this.options.outputDir}/fund_flows.json`
        );
    }

    // New methods for delegator-focused analysis
    async getDelegatorAddresses() {
        await this.tracker.runFullAnalysis();
        return this.tracker.getIndividualDelegatorAddresses();
    }

    async trackSpecificDelegators(delegatorAddresses, options = {}) {
        return await this.flowTracker.trackDelegatorFundFlows(delegatorAddresses, {
            includeVisualizations: options.includeVisualizations || this.options.includeVisualizations,
            amountThreshold: options.threshold || this.options.fundFlowThreshold,
            outputFilePrefix: options.outputPrefix || `${this.options.outputDir}/specific_delegator_analysis`
        });
    }

    getFilterResults() {
        return this.tracker.getFilterResults();
    }
}

// Example usage when run directly
async function main() {
    if (require.main === module) {
        // Example: analyze validator for individual delegators
        const validatorId = process.argv[2] || 27;
        const months = parseInt(process.argv[3]) || 6;
        
        console.log(`📊 Example: Individual Delegator Analysis for Validator ${validatorId} (${months} months)`);
        console.log('🎯 This will identify and track individual delegators, excluding exchanges and DeFi');
        
        try {
            const tracker = new ValidatorStakeTracker(validatorId, { 
                months,
                includeVisualizations: false // Set to true if you have MetaSleuth API key
            });
            const results = await tracker.runCompleteAnalysis();
            
            console.log('\n🎉 Individual delegator analysis completed!');
            console.log('📁 Check the output directory for results.');
            console.log('\n🔗 Next Steps:');
            console.log('1. Copy the delegator addresses shown above');
            console.log('2. Visit https://metasleuth.io for visual fund flow analysis');
            console.log('3. Look for suspicious patterns or connections');
            
        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
            process.exit(1);
        }
    }
}

// Export for library usage
module.exports = {
    ValidatorStakeTracker,
    ValidatorTracker,
    ChartGenerator,
    FundFlowTracker,
    DelegatorFilter,
    MetaSleuthVisualizer,
    EthereumDelegationTracker
};

// Run if called directly
main();