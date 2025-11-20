// Environment configuration for the Voice Marketplace application

export const config = {
  // Sui Smart Contract
  packageId: import.meta.env.VITE_PACKAGE_ID,
  registryId: import.meta.env.VITE_REGISTRY_ID,
  
  // Seal Server Object IDs
  serverObjectIds: [
    import.meta.env.VITE_SERVER_OBJECT_ID_1,
    import.meta.env.VITE_SERVER_OBJECT_ID_2,
  ].filter(Boolean), // Filter out undefined values
  
  // Walrus URLs
  walrus: {
    publisherUrl: import.meta.env.VITE_WALRUS_PUBLISHER_URL,
    aggregatorUrl: import.meta.env.VITE_WALRUS_AGGREGATOR_URL,
    explorerUrl: import.meta.env.VITE_WALRUS_EXPLORER_URL,
  },
  
  // Pricing
  pricing: {
    basePricePerDay: parseInt(import.meta.env.VITE_BASE_PRICE_PER_DAY || '1000000'),
  },
} as const;

// Validation function to ensure all required env vars are set
export const validateConfig = () => {
  const required = {
    'VITE_PACKAGE_ID': config.packageId,
    'VITE_REGISTRY_ID': config.registryId,
    'VITE_SERVER_OBJECT_ID_1': import.meta.env.VITE_SERVER_OBJECT_ID_1,
    'VITE_SERVER_OBJECT_ID_2': import.meta.env.VITE_SERVER_OBJECT_ID_2,
    'VITE_WALRUS_PUBLISHER_URL': config.walrus.publisherUrl,
    'VITE_WALRUS_AGGREGATOR_URL': config.walrus.aggregatorUrl,
  };

  const missing = Object.entries(required)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    console.error('Missing required environment variables:', missing.join(', '));
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
};

// Call validation on import (optional - comment out if you want manual validation)
validateConfig();