// Voice Data Marketplace with Dynamic Pricing
module starfish::voice_marketplace;

use std::string::String;
use sui::{clock::Clock, coin::Coin, dynamic_field as df, sui::SUI, event};

const EInvalidCap: u64 = 0;
const EInvalidFee: u64 = 1;
const ENoAccess: u64 = 2;
const ECannotBuyOwnDataset: u64 = 3;
const MARKER: u64 = 4;

// Base price: 0.001 SUI per day for 30 seconds = 1_000_000 MIST
const BASE_PRICE_PER_DAY: u64 = 1_000_000;
const MS_PER_DAY: u64 = 24 * 60 * 60 * 1000;

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
    duration_seconds: u64, // Store actual duration in seconds
    blob_id: String,
    encryption_id: vector<u8>,
    created_at: u64,
}

/// Subscription to access a voice dataset
public struct Subscription has key, store {
    id: UID,
    dataset_id: ID,
    subscriber: address,
    created_at: u64,
    expires_at: u64, // When the subscription expires
    days_purchased: u64, // How many days were purchased
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
    duration_seconds: u64,
}

/// Event emitted when subscription is purchased
public struct SubscriptionPurchased has copy, drop {
    dataset_id: ID,
    subscriber: address,
    creator: address,
    amount: u64,
    days_purchased: u64,
    expires_at: u64,
}

//////////////////////////////////////////
// Pricing Logic

/// Calculate price based on duration and days
/// Formula: (duration_seconds / 30) * BASE_PRICE_PER_DAY * days
public fun calculate_price(duration_seconds: u64, days: u64): u64 {
    let duration_multiplier = duration_seconds / 30; // 30 sec = 1x, 60 sec = 2x, etc.
    BASE_PRICE_PER_DAY * duration_multiplier * days
}

/// Helper to parse duration string to seconds
public fun parse_duration_to_seconds(duration: &String): u64 {
    // Expected formats: "30 seconds", "1 minute", "2 minutes", "5 minutes"
    if (duration == &std::string::utf8(b"30 seconds")) {
        30
    } else if (duration == &std::string::utf8(b"1 minute")) {
        60
    } else if (duration == &std::string::utf8(b"2 minutes")) {
        120
    } else if (duration == &std::string::utf8(b"5 minutes")) {
        300
    } else {
        30 // Default to 30 seconds
    }
}

//////////////////////////////////////////
// Dataset Management

/// Create a new voice dataset
public fun create_dataset(
    language: String,
    dialect: String,
    duration: String,
    blob_id: String,
    encryption_id: vector<u8>,
    c: &Clock,
    ctx: &mut TxContext,
): DatasetCap {
    let dataset_timestamp = c.timestamp_ms();
    let creator = ctx.sender();
    let duration_seconds = parse_duration_to_seconds(&duration);
    
    let dataset = VoiceDataset {
        id: object::new(ctx),
        creator,
        language,
        dialect,
        duration_seconds,
        blob_id,
        encryption_id,
        created_at: dataset_timestamp,
    };
    
    let dataset_id = object::id(&dataset);
    
    event::emit(DatasetCreated {
        dataset_id,
        creator,
        language: dataset.language,
        dialect: dataset.dialect,
        duration_seconds,
    });
    
    let cap = DatasetCap {
        id: object::new(ctx),
        dataset_id,
    };
    
    transfer::share_object(dataset);
    cap
}

entry fun create_dataset_entry(
    language: String,
    dialect: String,
    duration: String,
    blob_id: String,
    encryption_id: vector<u8>,
    c: &Clock,
    ctx: &mut TxContext,
) {
    let cap = create_dataset(language, dialect, duration, blob_id, encryption_id, c, ctx);
    transfer::transfer(cap, ctx.sender());
}

/// Publish (attach) the Walrus blob to a dataset as a dynamic field
public fun publish(
    dataset: &mut VoiceDataset,
    cap: &DatasetCap,
    blob_id: String,
    c: &Clock,
    ctx: &mut TxContext,
) {
    assert!(cap.dataset_id == object::id(dataset), EInvalidCap);
    
    let walrus_blob = WalrusBlob {
        id: object::new(ctx),
        blob_id,
        dataset_id: object::id(dataset),
        encrypted_at: c.timestamp_ms(),
    };
    
    df::add(&mut dataset.id, b"walrus_blob", walrus_blob);
}

entry fun publish_entry(
    dataset: &mut VoiceDataset,
    cap: &DatasetCap,
    blob_id: String,
    c: &Clock,
    ctx: &mut TxContext,
) {
    publish(dataset, cap, blob_id, c, ctx);
}

/// Purchase subscription to a dataset for specified number of days
public fun subscribe(
    payment: Coin<SUI>,
    dataset: &VoiceDataset,
    days: u64,
    c: &Clock,
    ctx: &mut TxContext,
): Subscription {
    assert!(ctx.sender() != dataset.creator, ECannotBuyOwnDataset);
    
    let expected_fee = calculate_price(dataset.duration_seconds, days);
    assert!(payment.value() == expected_fee, EInvalidFee);
    
    transfer::public_transfer(payment, dataset.creator);
    
    let current_time = c.timestamp_ms();
    let expires_at = current_time + (days * MS_PER_DAY);
    
    let subscription = Subscription {
        id: object::new(ctx),
        dataset_id: object::id(dataset),
        subscriber: ctx.sender(),
        created_at: current_time,
        expires_at,
        days_purchased: days,
    };
    
    event::emit(SubscriptionPurchased {
        dataset_id: object::id(dataset),
        subscriber: ctx.sender(),
        creator: dataset.creator,
        amount: expected_fee,
        days_purchased: days,
        expires_at,
    });
    
    subscription
}

entry fun subscribe_entry(
    payment: Coin<SUI>,
    dataset: &VoiceDataset,
    days: u64,
    c: &Clock,
    ctx: &mut TxContext,
) {
    transfer::transfer(subscribe(payment, dataset, days, c, ctx), ctx.sender());
}

//////////////////////////////////////////
// Access Control

/// Check if user has access to decrypt the dataset
fun approve_internal(
    id: vector<u8>,
    dataset: &VoiceDataset,
    sub: &Subscription,
    c: &Clock,
): bool {
    if (object::id(dataset) != sub.dataset_id) {
        return false
    };
    
    // Check if subscription has expired
    if (c.timestamp_ms() > sub.expires_at) {
        return false
    };
    
    is_prefix(dataset.encryption_id, id)
}

entry fun seal_approve(
    id: vector<u8>,
    sub: &Subscription,
    dataset: &VoiceDataset,
    c: &Clock,
) {
    assert!(approve_internal(id, dataset, sub, c), ENoAccess);
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

public fun get_base_price_per_day(): u64 {
    BASE_PRICE_PER_DAY
}

public fun get_dataset_creator(dataset: &VoiceDataset): address {
    dataset.creator
}

public fun get_dataset_duration(dataset: &VoiceDataset): u64 {
    dataset.duration_seconds
}

public fun get_subscription_expiry(sub: &Subscription): u64 {
    sub.expires_at
}

public fun is_subscription_active(sub: &Subscription, c: &Clock): bool {
    c.timestamp_ms() <= sub.expires_at
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