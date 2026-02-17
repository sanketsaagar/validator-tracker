#!/usr/bin/env node

/**
 * Test script for Ethereum delegation tracking
 * Run this to verify Etherscan API is working and fetching delegation events
 */

const EthereumDelegationTracker = require('./EthereumDelegationTracker');

async function testEthereumDelegationTracking() {
    console.log('🧪 Testing Ethereum Delegation Tracking');
    console.log('=====================================\n');
    
    const tracker = new EthereumDelegationTracker();
    
    // Check API key
    console.log('🔑 Testing Etherscan API connection...');
    const apiTest = await tracker.testApiConnection();
    
    if (!apiTest.success) {
        console.log(`❌ API Connection failed: ${apiTest.message}`);
        
        if (apiTest.message.includes('API key')) {
            console.log('\n💡 To fix this:');
            console.log('1. Get an Etherscan API key from https://etherscan.io/apis');  
            console.log('2. Set it as an environment variable:');
            console.log('   export ETHERSCAN_API_KEY="your_actual_api_key"');
            console.log('3. Or add it to your .env file');
        }
        return;
    }
    
    console.log(`✅ ${apiTest.message}\n`);
    
    // Test with a known validator that should have delegation activity
    console.log('📊 Testing delegation event fetching...');
    console.log('Using validator 45 as test case\n');
    
    try {
        // Test getting delegation summary for last 1 month (shorter range for testing)
        const summary = await tracker.getDelegationSummary(45, 1);
        
        console.log('📈 Delegation Summary:');
        console.log(`Total Delegated: ${summary.totalDelegated.toLocaleString()} POL`);
        console.log(`Delegation Events: ${summary.delegationEvents}`);
        console.log(`Unique Delegators: ${summary.uniqueDelegators}`);
        
        if (summary.delegationEvents > 0) {
            console.log('\n🎉 Success! Found delegation events from Ethereum mainnet');
            console.log('\n📋 Sample Events:');
            summary.events.slice(0, 3).forEach((event, index) => {
                console.log(`${index + 1}. ${event.user}: ${event.amountPol.toFixed(2)} POL`);
                console.log(`   Block: ${event.blockNumber}, Time: ${event.parsedTime.toDateString()}`);
            });
            
            if (summary.events.length > 3) {
                console.log(`   ... and ${summary.events.length - 3} more events`);
            }
        } else {
            console.log('\n📝 No delegation events found for this validator in the last month');
            console.log('This could mean:');
            console.log('- No recent delegations to this validator');
            console.log('- Wrong event signature or contract address');
            console.log('- API rate limiting or other issues');
        }
        
    } catch (error) {
        console.error('❌ Error during delegation testing:', error.message);
        
        if (error.message.includes('rate limit')) {
            console.log('⏳ Try again in a few minutes due to API rate limits');
        }
    }
    
    console.log('\n✅ Ethereum delegation tracking test completed!');
    console.log('\n💡 Next steps:');
    console.log('- Run: npx track-validator analyze 45 --months 1');
    console.log('- Check if delegation data now appears in the results');
}

// Run the test
testEthereumDelegationTracking().catch(error => {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
});