#!/usr/bin/env node

/**
 * Example usage of the Validator Stake Tracker
 * This demonstrates different ways to use the tool
 */

const { ValidatorStakeTracker, ValidatorTracker, FundFlowTracker } = require('./index');

async function basicExample() {
    console.log('📊 Basic Validator Analysis Example');
    console.log('=====================================\n');
    
    try {
        // Create a tracker for validator 27, analyzing last 3 months
        const tracker = new ValidatorTracker(27, 3);
        
        // Fetch validator info
        await tracker.fetchValidatorInfo();
        console.log('Validator Info:', tracker.validatorInfo.name || 'Unknown');
        
        // Fetch and analyze data
        await tracker.fetchUnbonds();
        await tracker.fetchDelegations();
        
        // Print summary
        const analysis = tracker.printAnalysisSummary();
        
        console.log('\n✅ Basic analysis completed!\n');
        
    } catch (error) {
        console.error('❌ Error in basic example:', error.message);
    }
}

async function fullAnalysisExample() {
    console.log('🚀 Full Analysis with Visualizations Example');
    console.log('============================================\n');
    
    try {
        // Complete analysis with all features
        const stakeTracker = new ValidatorStakeTracker(27, {
            months: 6,
            generateCharts: true,
            exportData: true,
            outputDir: './example-output'
        });
        
        const results = await stakeTracker.runCompleteAnalysis();
        
        console.log('\n📊 Results Summary:');
        console.log(`- Charts generated: ${results.fundFlowReport ? 'Yes' : 'No'}`);
        console.log(`- Fund flow data: ${results.fundFlowReport ? 'Available' : 'Not available'}`);
        console.log(`- Output location: ${results.outputDirectory}`);
        
        console.log('\n✅ Full analysis completed!\n');
        
    } catch (error) {
        console.error('❌ Error in full analysis example:', error.message);
    }
}

async function fundFlowExample() {
    console.log('💸 Fund Flow Analysis Example');
    console.log('==============================\n');
    
    try {
        // Example addresses (replace with real addresses from your validator analysis)
        const exampleAddresses = [
            '0x1234567890123456789012345678901234567890',
            '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdef',
            '0x9876543210987654321098765432109876543210'
        ];
        
        console.log('⚠️  Using example addresses - replace with real addresses from validator analysis');
        
        const flowTracker = new FundFlowTracker();
        
        // Generate flow report
        const report = await flowTracker.generateFlowReport(
            exampleAddresses,
            './example-output/example_fund_flows.json'
        );
        
        // Print summary
        flowTracker.printFlowSummary(report);
        
        console.log('\n✅ Fund flow analysis completed!\n');
        
    } catch (error) {
        console.error('❌ Error in fund flow example:', error.message);
    }
}

async function customAnalysisExample() {
    console.log('🔧 Custom Analysis Example');
    console.log('===========================\n');
    
    try {
        const tracker = new ValidatorTracker(27, 6);
        
        // Fetch data
        await tracker.fetchValidatorInfo();
        await tracker.fetchUnbonds();
        await tracker.fetchDelegations();
        
        // Custom analysis
        const analysis = tracker.analyzeStakeChanges();
        const timeSeriesData = tracker.generateTimeSeriesData();
        
        console.log('📈 Custom Metrics:');
        console.log(`Average unbond size: ${(analysis.totalUnbonded / analysis.unbondEvents).toFixed(2)} POL`);
        console.log(`Average delegation size: ${(analysis.totalDelegated / analysis.delegationEvents).toFixed(2)} POL`);
        console.log(`Unique unbonders: ${Object.keys(analysis.addressUnbonds).length}`);
        console.log(`Unique delegators: ${Object.keys(analysis.addressDelegations).length}`);
        
        // Find most active day
        if (timeSeriesData.allEvents.length > 0) {
            const dailyActivity = {};
            timeSeriesData.allEvents.forEach(event => {
                const day = event.time.toDateString();
                dailyActivity[day] = (dailyActivity[day] || 0) + 1;
            });
            
            const mostActiveDay = Object.entries(dailyActivity)
                .sort(([,a], [,b]) => b - a)[0];
            
            console.log(`Most active day: ${mostActiveDay[0]} (${mostActiveDay[1]} events)`);
        }
        
        console.log('\n✅ Custom analysis completed!\n');
        
    } catch (error) {
        console.error('❌ Error in custom analysis example:', error.message);
    }
}

async function runAllExamples() {
    console.log('🎯 Running All Examples');
    console.log('========================\n');
    
    const examples = [
        { name: 'Basic Analysis', fn: basicExample },
        { name: 'Custom Analysis', fn: customAnalysisExample },
        { name: 'Fund Flow Analysis', fn: fundFlowExample },
        { name: 'Full Analysis', fn: fullAnalysisExample }
    ];
    
    for (const example of examples) {
        console.log(`\n🔄 Running ${example.name}...`);
        try {
            await example.fn();
        } catch (error) {
            console.error(`❌ ${example.name} failed:`, error.message);
        }
        
        // Add delay between examples
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n🎉 All examples completed!');
    console.log('\n💡 Tips:');
    console.log('- Set POLYGONSCAN_API_KEY environment variable for better results');
    console.log('- Check ./example-output directory for generated files');
    console.log('- Modify validator IDs and time periods as needed');
}

// Handle command line usage
async function main() {
    const command = process.argv[2];
    
    switch (command) {
        case 'basic':
            await basicExample();
            break;
        case 'full':
            await fullAnalysisExample();
            break;
        case 'flows':
            await fundFlowExample();
            break;
        case 'custom':
            await customAnalysisExample();
            break;
        case 'all':
        default:
            await runAllExamples();
            break;
    }
}

// Show usage if run directly
if (require.main === module) {
    console.log('🚀 Validator Stake Tracker - Examples\n');
    
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        console.log('Usage: node example.js [command]\n');
        console.log('Commands:');
        console.log('  basic   - Basic validator analysis');
        console.log('  full    - Full analysis with charts');
        console.log('  flows   - Fund flow analysis only');
        console.log('  custom  - Custom analysis example');
        console.log('  all     - Run all examples (default)\n');
        console.log('Environment variables:');
        console.log('  POLYGONSCAN_API_KEY - For enhanced fund tracking');
        console.log('  ETHERSCAN_API_KEY   - For additional data sources\n');
    } else {
        main().catch(error => {
            console.error('❌ Example failed:', error.message);
            process.exit(1);
        });
    }
}