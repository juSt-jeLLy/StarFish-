# Voice Vault - Contract & Frontend Updates Summary

## Overview
Updated Voice Data Marketplace to use a new Sui contract with Walrus blob integration. The WalrusBlob object is now attached as a dynamic field to the VoiceDataset, enabling it to appear as a connected NFT on Suiscan.

---

## Contract Changes (Move)

### New Package ID
- **Old**: `0x0d5d95c2f59decb58d1c77a9ffe07de0e259a32379793e364bb779c1be684a39`
- **New**: `0x86fc08437c61ce84ba28e05efcd0fc20dba421b265ac8bcb4f0796c92b4073f2`

### New Struct: WalrusBlob
```move
public struct WalrusBlob has key, store {
    id: UID,
    blob_id: String,        // Reference to the Walrus blob
    dataset_id: ID,          // Reference to the parent dataset
    encrypted_at: u64,       // Timestamp of encryption
}
```

### Updated `create_dataset` Function
- Creates a `VoiceDataset` object
- Creates a `WalrusBlob` object representing encrypted data on Walrus
- **Attaches WalrusBlob as a dynamic field** to the dataset using `df::add()`
- This makes the blob appear connected to the dataset on Suiscan as an NFT

### Entry Point: `create_dataset_entry`
- Returns the `dataset_id` (ID type) so it appears in transaction effects
- Creates and transfers both:
  - `VoiceDataset` (owned by creator)
  - `DatasetCap` (owned by creator)
- WalrusBlob is a dynamic field of VoiceDataset

---

## Frontend Changes

### 1. Updated Package IDs in All Files

**Files Updated:**
- `src/components/WalrusEncryptUpload.tsx`
- `src/pages/Marketplace.tsx`
- `src/pages/MySubscriptions.tsx`
- `sui.config.ts`

**Changes:**
```typescript
// Old
const PACKAGE_ID = "0x0d5d95c2f59decb58d1c77a9ffe07de0e259a32379793e364bb779c1be684a39";

// New
const PACKAGE_ID = "0x86fc08437c61ce84ba28e05efcd0fc20dba421b265ac8bcb4f0796c92b4073f2";
```

### 2. Updated WalrusEncryptUpload Component

**Type Changes:**
```typescript
// Updated interface to handle DatasetInfo object
interface WalrusEncryptUploadProps {
  audioBlob: Blob;
  language: string;
  dialect: string;
  duration: string;
  onSuccess: (datasetInfo: DatasetInfo) => void;  // Changed from string to DatasetInfo
}
```

**Transaction Improvements:**
- Added comments explaining Walrus blob attachment mechanism
- Updated dataset ID extraction logic to:
  1. Check `effects.created` for VoiceDataset object (owner is AddressOwner, not Immutable)
  2. Check `events` for `DatasetCreated` event with dataset_id
  3. Fallback to transaction digest if ID cannot be extracted

**Dataset Info Returned:**
```typescript
type DatasetInfo = {
  blobId: string;        // Walrus blob ID
  datasetId: string;     // Sui object ID of VoiceDataset
  txDigest: string;      // Transaction digest
};
```

---

## How It Works Now

### Creating a Dataset Flow:
1. User records audio on frontend
2. Frontend encrypts audio using Seal encryption
3. Encrypted data uploaded to Walrus → returns `blobId`
4. Frontend calls `create_dataset_entry(language, dialect, duration, blobId, clock)`
5. Smart contract:
   - Creates `VoiceDataset` object (owned by creator)
   - Creates `WalrusBlob` object with the `blobId`
   - Attaches WalrusBlob to VoiceDataset as dynamic field
   - Returns `dataset_id`
6. Frontend displays:
   - Walrus blob link: `https://aggregator.walrus-testnet.walrus.space/v1/blobs/{blobId}`
   - Suiscan object link: `https://suiscan.xyz/testnet/object/{datasetId}`

### On Suiscan:
- VoiceDataset appears as an owned object
- WalrusBlob appears as a connected NFT/dynamic field of the dataset
- All metadata visible (language, dialect, duration, creator)
- Easy to see the relationship between dataset and encrypted blob

---

## Files Modified

### Move Contract
- `/Users/yagnesh/Desktop/Test/voice-vault/move/sources/subscription.move`
  - Added `WalrusBlob` struct
  - Updated `create_dataset()` to attach WalrusBlob as dynamic field
  - Entry point `create_dataset_entry()` returns dataset ID

### Frontend
- `src/components/WalrusEncryptUpload.tsx` - Package ID + interface + dataset ID extraction
- `src/pages/Marketplace.tsx` - Package ID
- `src/pages/MySubscriptions.tsx` - Package ID
- `sui.config.ts` - Package ID + validation function

---

## Testing

### Build Status: ✅ SUCCESS
```bash
npm run build
# ✓ built in 1.67s
```

### Contract Publication: ✅ SUCCESS
```
Transaction Digest: Fo6tEUFq3ezDj4PZZ3MybNHDtcMbwMnfK7PfczNJrLqc
Package ID: 0x86fc08437c61ce84ba28e05efcd0fc20dba421b265ac8bcb4f0796c92b4073f2
```

---

## How to Use

1. **Record voice data** on `/record` page
2. **Publish to marketplace** - triggers:
   - Walrus encryption and upload
   - Sui blockchain dataset creation
   - WalrusBlob attachment to VoiceDataset
3. **View on Suiscan** - opens object explorer showing:
   - Dataset metadata
   - Connected WalrusBlob
   - Creator earnings
   - Subscription information

---

## Additional Notes

- **Dynamic Fields**: WalrusBlob is stored as a dynamic field (key: `b"walrus_blob"`) on the VoiceDataset
- **Cost**: Only one additional object creation (WalrusBlob) vs the old approach
- **Discoverability**: Suiscan will show the relationship visually
- **Security**: Walrus encryption ensures data privacy until subscription purchased
