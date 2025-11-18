// Voice Data Marketplace with Subscription Model
module starfish::voice_marketplace;

use std::string::String;
use sui::{clock::Clock, coin::Coin, dynamic_field as df, sui::SUI, balance::{Self, Balance}, event};

const EInvalidCap: u64 = 0;
const EInvalidFee: u64 = 1;
const ENoAccess: u64 = 2;
const ECannotBuyOwnDataset: u64 = 3;
const MARKER: u64 = 4;

// Fixed subscription fee: 0.01 SUI = 10_000_000 MIST
const SUBSCRIPTION_FEE: u64 = 10_000_000;

/// Voice dataset with metadata
public struct VoiceDataset has key {
    id: UID,
    creator: address,
    language: String,
    dialect: String,
    duration: String,
    blob_id: String,
    created_at: u64,
    earnings: Balance<SUI>,
}

/// Subscription to access a voice dataset
public struct Subscription has key, store {
    id: UID,
    dataset_id: ID,
    subscriber: address,
    created_at: u64,
}

/// Admin capability for dataset creator
public struct DatasetCap has key {
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
    c: &Clock,
    ctx: &mut TxContext,
): DatasetCap {
    let dataset = VoiceDataset {
        id: object::new(ctx),
        creator: ctx.sender(),
        language,
        dialect,
        duration,
        blob_id,
        created_at: c.timestamp_ms(),
        earnings: balance::zero(),
    };
    
    let dataset_id = object::id(&dataset);
    
    event::emit(DatasetCreated {
        dataset_id,
        creator: ctx.sender(),
        language: dataset.language,
        dialect: dataset.dialect,
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
    c: &Clock,
    ctx: &mut TxContext,
) {
    transfer::transfer(create_dataset(language, dialect, duration, blob_id, c, ctx), ctx.sender());
}

/// Purchase subscription to a dataset
public fun subscribe(
    payment: Coin<SUI>,
    dataset: &mut VoiceDataset,
    c: &Clock,
    ctx: &mut TxContext,
): Subscription {
    // Prevent creator from buying their own dataset
    assert!(ctx.sender() != dataset.creator, ECannotBuyOwnDataset);
    assert!(payment.value() == SUBSCRIPTION_FEE, EInvalidFee);
    
    // Add payment to dataset earnings
    let payment_balance = payment.into_balance();
    dataset.earnings.join(payment_balance);
    
    let subscription = Subscription {
        id: object::new(ctx),
        dataset_id: object::id(dataset),
        subscriber: ctx.sender(),
        created_at: c.timestamp_ms(),
    };
    
    event::emit(SubscriptionPurchased {
        dataset_id: object::id(dataset),
        subscriber: ctx.sender(),
        amount: SUBSCRIPTION_FEE,
    });
    
    subscription
}

entry fun subscribe_entry(
    payment: Coin<SUI>,
    dataset: &mut VoiceDataset,
    c: &Clock,
    ctx: &mut TxContext,
) {
    transfer::transfer(subscribe(payment, dataset, c, ctx), ctx.sender());
}

/// Creator withdraws earnings
public fun withdraw_earnings(
    dataset: &mut VoiceDataset,
    cap: &DatasetCap,
    ctx: &mut TxContext,
) {
    assert!(cap.dataset_id == object::id(dataset), EInvalidCap);
    let amount = dataset.earnings.value();
    if (amount > 0) {
        let withdrawn = dataset.earnings.split(amount);
        transfer::public_transfer(withdrawn.into_coin(ctx), dataset.creator);
    };
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

public fun get_dataset_earnings(dataset: &VoiceDataset): u64 {
    dataset.earnings.value()
}

#[test_only]
public fun destroy_for_testing(dataset: VoiceDataset, sub: Subscription, cap: DatasetCap) {
    let VoiceDataset { id, earnings, .. } = dataset;
    earnings.destroy_for_testing();
    object::delete(id);
    let Subscription { id, .. } = sub;
    object::delete(id);
    let DatasetCap { id, .. } = cap;
    object::delete(id);
}