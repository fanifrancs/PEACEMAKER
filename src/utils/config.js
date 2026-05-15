/**
 * Configuration Utility
 * Loads and manages environment configuration
 */

require('dotenv').config();

const config = {
  // IBM Bob API Configuration
  ibmBob: {
    apiKey: process.env.IBM_BOB_API_KEY || '',
    apiUrl: process.env.IBM_BOB_API_URL || 'https://api.ibm.com/bob/v1',
    timeout: parseInt(process.env.PEACEMAKER_TIMEOUT, 10) || 180000,
    maxRetries: parseInt(process.env.PEACEMAKER_MAX_RETRIES, 10) || 3,
  },

  // GitHub Configuration
  github: {
    token: process.env.GITHUB_TOKEN || '',
  },

  // Peacemaker Configuration
  peacemaker: {
    logLevel: process.env.PEACEMAKER_LOG_LEVEL || 'info',
    defaultTargetBranch: 'main',
    maxDivergenceForTier1: 5,
    maxDivergenceForTier2: 20,
    maxFilesForTier1: 3,
    maxFilesForTier2: 15,
  },

  // Validation
  isConfigured() {
    return !!this.ibmBob.apiKey;
  },

  validate() {
    const errors = [];

    if (!this.ibmBob.apiKey) {
      errors.push('IBM_BOB_API_KEY is not set. Please configure it in .env file.');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration errors:\n${errors.join('\n')}`);
    }
  },
};

module.exports = config;

// Made with Bob
