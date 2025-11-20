# STARFISH 🌟 Voice Data Marketplace

> **Decentralized marketplace for voice recordings with encrypted storage, provable ownership, and fair creator incentives**

[![Sui Testnet](https://img.shields.io/badge/Sui-Testnet-blue)](https://suiscan.xyz/testnet/object/0xaeb46ee2312a97f98095b3dca0993790337ec0ec9fd0692dd4979a004f3d187c)
[![Smart Contract](https://img.shields.io/badge/Contract-Verified-green)](https://suiscan.xyz/testnet/object/0xaeb46ee2312a97f98095b3dca0993790337ec0ec9fd0692dd4979a004f3d187c/tx-blocks)

**📜 Smart Contract:** [`0xaeb46ee2312a97f98095b3dca0993790337ec0ec9fd0692dd4979a004f3d187c`](https://suiscan.xyz/testnet/object/0xaeb46ee2312a97f98095b3dca0993790337ec0ec9fd0692dd4979a004f3d187c/tx-blocks)

---

## 🌊 What is STARFISH?

**StarFish** is a decentralized marketplace for voice data where users can securely monetize their voice recordings through encrypted data subscriptions. Built on **Sui blockchain** with **Seal encryption**, the platform enables creators to upload voice datasets in various languages and dialects, which are encrypted and stored on **Walrus decentralized storage**. 

Buyers can purchase time-limited subscriptions to access these datasets, with payments going directly to creators. The system uses advanced cryptographic access control to ensure only authorized subscribers can decrypt and download the voice data, creating a trustless marketplace for **AI training data**, **voice cloning**, and **linguistic research** while maintaining complete privacy and security through end-to-end encryption.

Built for the **Data Economy/Marketplaces** track using **Sui blockchain**, **Walrus decentralized storage**, and **Seal encryption**.

---

## 🎯 The Problem

Voice data is critical for AI training, language preservation, and accessibility tools—yet current markets are broken:

1. **Centralized platforms exploit creators** - Big tech collects voice data with minimal compensation
2. **No provable ownership** - Creators can't prove they contributed specific datasets
3. **Languages are disappearing** - 40% of the world's 7,000 languages are endangered, with no economic incentive to preserve them
4. **Quality is inconsistent** - No mechanism to incentivize high-quality, properly categorized recordings
5. **Voice data is hard to find** - Categorized, high-quality voice datasets are scattered and difficult to discover

## 💡 Our Solution: STARFISH

A **decentralized voice data marketplace** where:

- **Creators own their data** with on-chain proof of contribution
- **Encryption protects content** until purchase (Seal threshold encryption)
- **Immutable storage on Walrus** ensures data persistence
- **Language creators earn discounts** - incentivizing new language/dialect additions
- **Dynamic pricing** based on recording duration and subscription length

### 🎙️ Why Voice Data on STARFISH is Different

Unlike scraped or crowd-sourced voice data, STARFISH provides:

- **Structured Categories** - Voice data organized by language, dialect, and duration—easy to find exactly what you need
- **In-App Recording Only** - Users must record directly on the platform with guided sample texts—no uploading random files, ensuring consistent quality
- **High-Quality Datasets** - Standardized recording interface with waveform visualization reduces low-quality submissions
- **Curated Sample Texts** - Each language includes reading material contributed by native speakers for guided recording
- **Provenance Tracking** - Every recording has on-chain attribution to the original creator

This is the **first voice data marketplace** that enforces quality through a **record-only model**—you can't upload pre-existing files, only create fresh recordings through our interface.

---

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   React Frontend │────▶│   Sui Blockchain │────▶│  Walrus Storage │
│   (Recording UI) │     │   (Smart Contract)│     │  (Encrypted Blobs)│
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │  Seal Encryption │
                        │  (Key Management)│
                        └─────────────────┘
```

### Tech Stack

| Component | Technology |
|-----------|------------|
| Blockchain | Sui (Move smart contracts) |
| Storage | Walrus (decentralized blob storage) |
| Encryption | Seal (threshold encryption) |
| Frontend | React + TypeScript + Tailwind |
| Wallet | @mysten/dapp-kit |

---

## ✨ Key Features

### 1. On-Chain Category System
Languages and dialects are registered on-chain, creating a community-curated taxonomy:

```move
public struct LanguageCategory has store {
    name: String,
    dialects: vector<DialectInfo>,
    sample_texts: vector<String>,
    created_by: address,  // Creator gets rewards!
    created_at: u64,
}
```

### 2. Creator Discount Incentive
Users who add new languages receive **20% discount** on all purchases in that language—encouraging preservation of rare languages:

```move
// Language creators get discounted access
fun is_language_creator(registry: &CategoryRegistry, language: &String, user: address): bool {
    let lang_category = vec_map::get(&registry.languages, language);
    lang_category.created_by == user
}
```

### 3. Encrypted Until Purchase
Voice data is encrypted with Seal before upload. Only subscription holders can decrypt:

```typescript
// Encryption happens client-side before Walrus upload
const { encryptedObject } = await sealClient.encrypt({
    threshold: 2,
    packageId: PACKAGE_ID,
    id: encryptionId,
    data: audioData,
});
```

### 4. Dynamic Pricing Model
Price scales with recording duration and subscription length:

```move
// Base: 0.001 SUI per day for 30 seconds
const BASE_PRICE_PER_DAY: u64 = 1_000_000; // MIST

public fun calculate_price(duration_seconds: u64, days: u64): u64 {
    let duration_multiplier = duration_seconds / 30;
    BASE_PRICE_PER_DAY * duration_multiplier * days
}
```

### 5. Bulk Subscriptions
Purchase multiple datasets in a single transaction with aggregated discounts:

```move
entry fun subscribe_bulk_3(
    registry: &CategoryRegistry,
    payment: Coin<SUI>,
    d1: &VoiceDataset, d2: &VoiceDataset, d3: &VoiceDataset,
    days: u64, c: &Clock, ctx: &mut TxContext,
)
```

---

## 🚀 Why Decentralized > Centralized?

| Aspect | Centralized (e.g., Amazon MTurk) | STARFISH |
|--------|----------------------------------|----------|
| **Ownership** | Platform owns data | Creator retains on-chain proof |
| **Pricing** | Platform sets rates | Market-driven, transparent |
| **Censorship** | Can delist content | Immutable on Walrus |
| **Incentives** | One-time payment | Ongoing royalties per subscription |
| **Language Preservation** | No special incentive | Creators of rare languages get discounts |
| **Privacy** | Platform sees all data | Encrypted until purchase |
| **Data Quality** | Mixed, unverified uploads | Record-only model, no uploads |

---

## 📊 Quality Incentives & Curation

### For Producers (Voice Recorders)
- **Sample texts provided** - Each language includes curated reading material
- **Duration options** - Standardized lengths (30s, 1min, 5min) for consistent quality
- **On-chain reputation** - Dataset history tied to wallet address
- **Record-only model** - No file uploads allowed, only in-app recordings for quality assurance

### For Consumers (AI Researchers, Developers)
- **Filter by language/dialect** - Find exactly what you need
- **Subscription model** - Try before committing long-term
- **Bulk purchase** - Efficient acquisition for large training sets
- **Guaranteed format** - All recordings follow the same quality standards

### Community Curation
- Anyone can add languages/dialects (permissionless)
- Sample texts are community-contributed
- Language creators become stakeholders with discount incentives

---

## 🛠️ Getting Started

### Prerequisites
- Node.js 18+
- Sui Wallet (Slush, Sui Wallet, etc.)
- Testnet SUI tokens

### Installation

```bash
# Clone the repository
git clone <YOUR_GIT_URL>
cd starfish-voice-marketplace

# Install dependencies
npm install

# Start development server
npm run dev
```

### Smart Contract Deployment

```bash
cd move
sui move build
sui client publish --gas-budget 100000000
```

---

## 📁 Project Structure

```
├── move/
│   └── sources/
│       └── subscription.move    # Core smart contract
├── src/
│   ├── components/
│   │   ├── Navigation.tsx       # App navigation
│   │   ├── WalrusEncryptUpload.tsx  # Seal encryption + Walrus upload
│   │   └── WaveformVisualizer.tsx   # Audio visualization
│   ├── pages/
│   │   ├── Marketplace.tsx      # Browse & purchase datasets
│   │   ├── MySubscriptions.tsx  # View owned subscriptions
│   │   └── Record.tsx           # Record & publish voice data
│   └── config/
│       └── env.ts               # Contract addresses & config
```

---

## 🔐 Security Model

1. **Threshold Encryption (Seal)** - Data encrypted with 2-of-N threshold scheme
2. **On-Chain Access Control** - Smart contract verifies subscription validity
3. **Time-Locked Access** - Subscriptions expire, requiring renewal
4. **No Central Key Holder** - Decryption keys distributed across Seal servers

```move
// Access check happens on-chain
entry fun seal_approve(
    id: vector<u8>,
    sub: &Subscription,
    dataset: &VoiceDataset,
    c: &Clock,
) {
    assert!(approve_internal(id, dataset, sub, c), ENoAccess);
}
```

---

## 🌍 Preserving Endangered Languages

STARFISH creates **economic incentives** for language preservation:

1. **First-mover advantage** - Add a language, get permanent discounts
2. **Community sample texts** - Native speakers contribute reading material
3. **Immutable storage** - Recordings persist on Walrus regardless of platform
4. **Open access model** - Anyone can record, anyone can purchase

> *"Every two weeks a language dies. STARFISH ensures voices are preserved forever."*

---

## 🏆 Hackathon Submission

**Track:** Data Economy/Marketplaces

**Key Innovations:**
1. **Creator incentive model** - Language creators get permanent discounts
2. **Encrypted-until-purchase** - Seal threshold encryption protects content
3. **Immutable preservation** - Walrus ensures data survives platform changes
4. **On-chain provenance** - Every recording has verifiable creator attribution
5. **Record-only approach** - No file uploads, only in-app recordings for guaranteed quality

---

## 🔗 Links

- **Smart Contract:** [View on Suiscan](https://suiscan.xyz/testnet/object/0xaeb46ee2312a97f98095b3dca0993790337ec0ec9fd0692dd4979a004f3d187c/tx-blocks)
- **Network:** Sui Testnet

---

## 📜 License

MIT License - Build freely, preserve languages, decentralize data.

---

## 🤝 Contributing

We welcome contributions! Especially for:
- Adding sample texts for underrepresented languages
- Improving audio quality validation
- Building mobile recording apps

---

**Built with 💙 for the decentralized future of voice data**
