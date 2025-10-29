# Individual Delegator Stake Tracker

A tool focused on tracking individual delegators on Polygon staking, filtering out exchanges and DeFi protocols, with integrated MetaSleuth visualization for fund flow analysis.

## 🎯 Key Features

- **Individual Delegator Focus**: Automatically filters out exchanges, DeFi protocols, and institutional addresses
- **MetaSleuth Integration**: Generate visual fund flow graphs for delegator addresses  
- **Comprehensive Filtering**: Uses extensive database of known exchange/DeFi addresses plus MetaSleuth API
- **Visual Analysis**: Direct links to MetaSleuth for interactive fund flow visualization
- **Actionable Insights**: Clear recommendations based on fund flow patterns
- **CLI Interface**: Easy-to-use commands focused on delegator tracking
- **Data Export**: Comprehensive reports with filtering statistics

## Installation

```bash
# Clone or download the project
cd validator-stake-tracker

# Install dependencies
npm install

# Make CLI executable (optional)
npm link
```

## Setup

### API Keys (Optional but Recommended)

Set these environment variables for enhanced functionality:

```bash
export POLYGONSCAN_API_KEY="your_polygonscan_api_key"
export ETHERSCAN_API_KEY="your_etherscan_api_key"
export METASLEUTH_API_KEY="your_metasleuth_api_key"
```

Get API keys from:
- [PolygonScan](https://polygonscan.com/apis) - For transaction data
- [Etherscan](https://etherscan.io/apis) - For additional Ethereum data
- [MetaSleuth](https://metasleuth.io/api-service) - For enhanced address labeling (300M+ labels)

## Usage

### Command Line Interface

#### Basic Validator Analysis
```bash
# Analyze validator 27 for the last 6 months
npx track-validator analyze 27

# Analyze for specific time period
npx track-validator analyze 27 --months 3

# Skip chart generation
npx track-validator analyze 27 --no-charts
```

#### Fund Flow Analysis
```bash
# Analyze specific addresses
npx track-validator flow-analysis 0x123... 0x456... 0x789...

# Set minimum tracking threshold
npx track-validator flow-analysis 0x123... --threshold 50
```

#### Combined Analysis (Recommended)
```bash
# Complete analysis with visualizations and fund tracking
npx track-validator combined 27

# Customize parameters
npx track-validator combined 27 --months 3 --threshold 100 --top-addresses 5
```

#### Setup Help
```bash
npx track-validator setup
```

### Programmatic Usage

```javascript
const { ValidatorStakeTracker } = require('./index');

async function analyzeValidator() {
    const tracker = new ValidatorStakeTracker(27, {
        months: 6,
        generateCharts: true,
        outputDir: './my-analysis'
    });
    
    const results = await tracker.runCompleteAnalysis();
    console.log('Analysis completed:', results);
}

analyzeValidator();
```

### Individual Modules

```javascript
const ValidatorTracker = require('./ValidatorTracker');
const ChartGenerator = require('./ChartGenerator');
const FundFlowTracker = require('./FundFlowTracker');

// Use individual components
const tracker = new ValidatorTracker(27, 6);
await tracker.runFullAnalysis();

const chartGen = new ChartGenerator();
await chartGen.generateAllCharts(tracker);

const flowTracker = new FundFlowTracker();
const report = await flowTracker.generateFlowReport(['0x123...']);
```

## Output Files

The tool generates several output files:

### Data Files
- `validator_[ID]_data_[timestamp].json` - Raw analysis data
- `fund_flow_report_[timestamp].json` - Fund flow analysis

### Charts (PNG files)
- `stake_analysis.png` - Cumulative stake changes over time
- `delegation_vs_unbonding.png` - Summary bar chart
- `top_addresses.png` - Top unbonding addresses (doughnut chart)
- `activity_timeline.png` - Daily activity histogram

## API Integration

### Current Integrations
- **Polygon Staking API**: Validator data, delegations, unbonding events
- **PolygonScan API**: Transaction tracking and fund flow analysis
- **MetaSleuth API**: Enhanced address labeling with 300M+ address database

### Planned Integrations
- **Dedaub**: Enhanced address classification and risk analysis

## Example Output

```
🔍 Analyzing Validator 27 (last 6 months)
============================================================

📊 STAKE ANALYSIS SUMMARY
============================================================
Current Stake: 1,234,567 POL
Total Delegated: 456,789 POL (123 events)
Total Unbonded: 234,567 POL (89 events)
Net Change: +222,222 POL
Percentage Change: +18.0234%

👥 TOP UNBONDING ADDRESSES:
 1. 0x1234...5678: 45,678 POL
 2. 0xabcd...efgh: 23,456 POL
 3. 0x9876...5432: 12,345 POL

💸 FUND FLOW ANALYSIS SUMMARY
============================================================
Total Tracked Outflows: 123,456 POL
Risk Assessment: MEDIUM - Significant exchange deposits

📊 Destination Breakdown:
  Exchange: 67,890 POL (55.0%) - 23 transactions
  Defi: 34,567 POL (28.0%) - 15 transactions
  Unknown: 20,999 POL (17.0%) - 8 transactions
```

## Configuration

### Known Addresses

The tool includes a database of known addresses for classification:

```javascript
// Add to FundFlowTracker.js
this.knownAddresses = {
    '0x5e3346444010135322268a0ca24b70e5b1d0d52a': { type: 'exchange', name: 'Binance' },
    '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063': { type: 'defi', name: 'Aave POL' },
    // Add more addresses as needed
};
```

## Extending the Tool

### Adding New APIs

1. Create a new method in `FundFlowTracker.js`:
```javascript
async getCustomAPIData(address) {
    // Your API integration here
    return analysisData;
}
```

2. Update the classification logic:
```javascript
classifyAddress(address) {
    // Enhanced classification logic
}
```

### Custom Visualizations

1. Add new chart methods to `ChartGenerator.js`:
```javascript
async createMyCustomChart(tracker, outputPath) {
    // Chart.js configuration
}
```

## Troubleshooting

### Common Issues

1. **API Rate Limits**: The tool includes delays between API calls. Increase `requestDelay` if needed.

2. **Missing Charts**: Ensure chart.js dependencies are installed:
   ```bash
   npm install chart.js chartjs-node-canvas
   ```

3. **No Fund Flow Data**: 
   - Check API keys are set correctly
   - Verify addresses have recent transactions
   - Check rate limiting isn't too aggressive

### Debug Mode

Set environment variable for verbose logging:
```bash
DEBUG=true npx track-validator analyze 27
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add your enhancements
4. Test thoroughly
5. Submit a pull request

## License

MIT License - feel free to use and modify as needed.

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review the example usage
3. Open an issue with detailed information about your use case

---

**Note**: This tool is for analysis purposes only. Always verify critical data through multiple sources.