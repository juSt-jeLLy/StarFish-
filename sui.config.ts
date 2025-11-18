// Sui Configuration for Starfish Voice Marketplace
// Replace PACKAGE_ID after deploying the Move contract

export const SUI_CONFIG = {
  // Replace this with your deployed package ID
  PACKAGE_ID: "0x02e421990f3349629427fdb6d090ea5c56e1e8f90f484deb8b15a97127f65de1",
  
  // Network configuration
  NETWORK: "testnet" as const,
  
  // Seal encryption server object IDs (testnet)
  SERVER_OBJECT_IDS: [
    "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75",
    "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8"
  ],
  
  // Walrus endpoints (testnet)
  WALRUS_PUBLISHER_URL: "https://publisher.walrus-testnet.walrus.space",
  WALRUS_AGGREGATOR_URL: "https://aggregator.walrus-testnet.walrus.space",
  
  // Subscription pricing
  SUBSCRIPTION_FEE: 10_000_000, // 0.01 SUI in MIST
  SUBSCRIPTION_FEE_SUI: 0.01,   // For display
  
  // Walrus storage epochs
  STORAGE_EPOCHS: 200,
  
  // Sui system objects
  CLOCK_OBJECT_ID: "0x6" as const,
  
  // Session key TTL (minutes)
  SESSION_KEY_TTL: 10,
  
  // Encryption threshold
  ENCRYPTION_THRESHOLD: 2,
} as const;

// Helper function to format SUI amounts
export function formatSUI(mist: number | bigint): string {
  return (Number(mist) / 1_000_000_000).toFixed(4);
}

// Helper function to validate package ID
export function validatePackageId(): boolean {
  if (SUI_CONFIG.PACKAGE_ID === "0x02e421990f3349629427fdb6d090ea5c56e1e8f90f484deb8b15a97127f65de1") {
    console.error(
      "⚠️  PACKAGE_ID not configured! Please deploy the Move contract and update sui.config.ts"
    );
    return false;
  }
  return true;
}

// Move module paths
export const MOVE_CALLS = {
  CREATE_DATASET: `${SUI_CONFIG.PACKAGE_ID}::voice_marketplace::create_dataset_entry`,
  SUBSCRIBE: `${SUI_CONFIG.PACKAGE_ID}::voice_marketplace::subscribe_entry`,
  SEAL_APPROVE: `${SUI_CONFIG.PACKAGE_ID}::voice_marketplace::seal_approve`,
  WITHDRAW_EARNINGS: `${SUI_CONFIG.PACKAGE_ID}::voice_marketplace::withdraw_earnings`,
} as const;

// Struct types
export const STRUCT_TYPES = {
  DATASET: `${SUI_CONFIG.PACKAGE_ID}::voice_marketplace::VoiceDataset`,
  SUBSCRIPTION: `${SUI_CONFIG.PACKAGE_ID}::voice_marketplace::Subscription`,
  DATASET_CAP: `${SUI_CONFIG.PACKAGE_ID}::voice_marketplace::DatasetCap`,
} as const;

// Event types
export const EVENT_TYPES = {
  DATASET_CREATED: `${SUI_CONFIG.PACKAGE_ID}::voice_marketplace::DatasetCreated`,
  SUBSCRIPTION_PURCHASED: `${SUI_CONFIG.PACKAGE_ID}::voice_marketplace::SubscriptionPurchased`,
} as const;

// Explorer URLs
export const EXPLORER_URLS = {
  OBJECT: (id: string) => `https://testnet.suivision.xyz/object/${id}`,
  TRANSACTION: (digest: string) => `https://testnet.suivision.xyz/txblock/${digest}`,
  ADDRESS: (addr: string) => `https://testnet.suivision.xyz/account/${addr}`,
} as const;

export default SUI_CONFIG;