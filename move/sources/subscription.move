// Voice Data Marketplace with Subscription Model
module starfish::voice_marketplace;

use std::string::String;
use sui::{clock::Clock, coin::Coin, dynamic_field as df, sui::SUI, event};

const EInvalidCap: u64 = 0;
const EInvalidFee: u64 = 1;
const ENoAccess: u64 = 2;
const ECannotBuyOwnDataset: u64 = 3;
const MARKER: u64 = 4;

// Fixed subscription fee: 0.01 SUI = 10_000_000 MIST
const SUBSCRIPTION_FEE: u64 = 10_000_000;

/// Walrus blob object to represent encrypted voice data stored on Walrus
public struct WalrusBlob has key, store {
    id: UID,
    blob_id: String,
    dataset_id: ID,
    encrypted_at: u64,
}

/// Voice dataset with metadata - MUST BE SHARED for marketplace to work
public struct VoiceDataset has key {
    id: UID,
    creator: address,
    language: String,
    dialect: String,
    duration: String,
    blob_id: String,
    encryption_id: vector<u8>,  // ← ADD THIS!
    created_at: u64,
}

/// Subscription to access a voice dataset
public struct Subscription has key, store {
    id: UID,
    dataset_id: ID,
    subscriber: address,
    created_at: u64,
}

/// Admin capability for dataset creator
public struct DatasetCap has key, store {
    id: UID,
    dataset_id: ID,
}

/// Event emitted when dataset is created
public struct DatasetCreated has copy, drop {
    dataset_id: ID,
    creator: address,
    language: String,
    dialect: String,
}

/// Event emitted when subscription is purchased
public struct SubscriptionPurchased has copy, drop {
    dataset_id: ID,
    subscriber: address,
    creator: address,
    amount: u64,
}

//////////////////////////////////////////
// Dataset Management

/// Create a new voice dataset
public fun create_dataset(
    language: String,
    dialect: String,
    duration: String,
    blob_id: String,
    encryption_id: vector<u8>,  // ← ADD THIS PARAMETER
    c: &Clock,
    ctx: &mut TxContext,
): DatasetCap {
    let dataset_timestamp = c.timestamp_ms();
    let creator = ctx.sender();
    
    let dataset = VoiceDataset {
        id: object::new(ctx),
        creator,
        language,
        dialect,
        duration,
        blob_id,
        encryption_id,  // ← STORE IT!
        created_at: dataset_timestamp,
    };
    
    let dataset_id = object::id(&dataset);
    
    event::emit(DatasetCreated {
        dataset_id,
        creator,
        language: dataset.language,
        dialect: dataset.dialect,
    });
    
    let cap = DatasetCap {
        id: object::new(ctx),
        dataset_id,
    };
    
    // CRITICAL: Share the dataset object so anyone can purchase subscriptions
    // This is the key difference - datasets must be shared objects like Services
    transfer::share_object(dataset);
    
    // Return the cap (caller must handle transfer)
    cap
}

// Entry function that handles Cap transfer automatically
entry fun create_dataset_entry(
    language: String,
    dialect: String,
    duration: String,
    blob_id: String,
        encryption_id: vector<u8>,  // ← ADD THIS PARAMETER

    c: &Clock,
    ctx: &mut TxContext,
) {
    let cap = create_dataset(language, dialect, duration, blob_id, encryption_id, c, ctx);
    // Transfer the Cap to sender
    transfer::transfer(cap, ctx.sender());
}

/// Publish (attach) the Walrus blob to a dataset as a dynamic field
/// This must be called after creating the dataset to link the encrypted blob to the Sui object
public fun publish(
    dataset: &mut VoiceDataset,
    cap: &DatasetCap,
    blob_id: String,
    c: &Clock,
    ctx: &mut TxContext,
) {
    // Verify that the cap matches this dataset
    assert!(cap.dataset_id == object::id(dataset), EInvalidCap);
    
    // Create a WalrusBlob object representing the encrypted blob on Walrus
    let walrus_blob = WalrusBlob {
        id: object::new(ctx),
        blob_id,
        dataset_id: object::id(dataset),
        encrypted_at: c.timestamp_ms(),
    };
    
    // Attach the WalrusBlob as a dynamic field of the dataset
    // This makes it appear as a connected NFT in Suiscan
    df::add(&mut dataset.id, b"walrus_blob", walrus_blob);
}

/// Entry point for publishing a blob to a dataset
entry fun publish_entry(
    dataset: &mut VoiceDataset,
    cap: &DatasetCap,
    blob_id: String,
    c: &Clock,
    ctx: &mut TxContext,
) {
    publish(dataset, cap, blob_id, c, ctx);
}

/// Purchase subscription to a dataset
public fun subscribe(
    payment: Coin<SUI>,
    dataset: &VoiceDataset,
    c: &Clock,
    ctx: &mut TxContext,
): Subscription {
    // Prevent creator from buying their own dataset
    assert!(ctx.sender() != dataset.creator, ECannotBuyOwnDataset);
    assert!(payment.value() == SUBSCRIPTION_FEE, EInvalidFee);
    
    // Transfer payment DIRECTLY to the dataset creator
    transfer::public_transfer(payment, dataset.creator);
    
    let subscription = Subscription {
        id: object::new(ctx),
        dataset_id: object::id(dataset),
        subscriber: ctx.sender(),
        created_at: c.timestamp_ms(),
    };
    
    event::emit(SubscriptionPurchased {
        dataset_id: object::id(dataset),
        subscriber: ctx.sender(),
        creator: dataset.creator,
        amount: SUBSCRIPTION_FEE,
    });
    
    subscription
}

entry fun subscribe_entry(
    payment: Coin<SUI>,
    dataset: &VoiceDataset,
    c: &Clock,
    ctx: &mut TxContext,
) {
    transfer::transfer(subscribe(payment, dataset, c, ctx), ctx.sender());
}

//////////////////////////////////////////
// Access Control (for Seal integration)

/// Check if user has access to decrypt the dataset
fun approve_internal(
    caller: address,
    id: vector<u8>,
    dataset: &VoiceDataset,
    sub: &Subscription,
): bool {
    // Check if subscription matches dataset
    if (object::id(dataset) != sub.dataset_id) {
        return false
    };
    
    // Check if caller is the subscriber
    if (caller != sub.subscriber) {
        return false
    };
    
    // Check if id has the right prefix (dataset ID)
    is_prefix(dataset.id.to_bytes(), id)
}

entry fun seal_approve(
    id: vector<u8>,
    sub: &Subscription,
    dataset: &VoiceDataset,
    ctx: &TxContext,
) {
    assert!(approve_internal(ctx.sender(), id, dataset, sub), ENoAccess);
}

/// Returns true if `prefix` is a prefix of `word`
fun is_prefix(prefix: vector<u8>, word: vector<u8>): bool {
    if (prefix.length() > word.length()) {
        return false
    };
    let mut i = 0;
    while (i < prefix.length()) {
        if (prefix[i] != word[i]) {
            return false
        };
        i = i + 1;
    };
    true
}

//////////////////////////////////////////
// View Functions

public fun get_subscription_fee(): u64 {
    SUBSCRIPTION_FEE
}

public fun get_dataset_creator(dataset: &VoiceDataset): address {
    dataset.creator
}

#[test_only]
public fun destroy_for_testing(dataset: VoiceDataset, sub: Subscription, cap: DatasetCap) {
    let VoiceDataset { id, .. } = dataset;
    object::delete(id);
    let Subscription { id, .. } = sub;
    object::delete(id);
    let DatasetCap { id, .. } = cap;
    object::delete(id);
}