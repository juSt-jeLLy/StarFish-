// Voice Data Marketplace with Dynamic Pricing, On-Chain Categories, Creator Discounts, and Bulk Subscriptions
module starfish::voice_marketplace;

use std::string::String;
use sui::{clock::Clock, coin::Coin, dynamic_field as df, sui::SUI, event, vec_map::{Self, VecMap}};

const EInvalidCap: u64 = 0;
const EInvalidFee: u64 = 1;
const ENoAccess: u64 = 2;
const ECannotBuyOwnDataset: u64 = 3;
const ELanguageNotFound: u64 = 4;
const EDialectNotFound: u64 = 5;
const ENotCategoryAdmin: u64 = 7;
const ELanguageAlreadyExists: u64 = 8;
const EDialectAlreadyExists: u64 = 9;
const EDurationAlreadyExists: u64 = 10;
const EEmptyDatasetList: u64 = 11;
const EInsufficientPayment: u64 = 12;

// Base price: 0.001 SUI per day for 30 seconds = 1_000_000 MIST
const BASE_PRICE_PER_DAY: u64 = 1_000_000;
const MS_PER_DAY: u64 = 24 * 60 * 60 * 1000;

// Default creator discount: 20% (represented as 20 out of 100)
const DEFAULT_CREATOR_DISCOUNT_PERCENT: u64 = 20;

/// Registry for all categories - SHARED object
public struct CategoryRegistry has key {
    id: UID,
    admin: address,
    languages: VecMap<String, LanguageCategory>,
    existing_durations: VecMap<String, bool>,
    creator_discount_percent: u64,
}

/// Language category with dialects
public struct LanguageCategory has store {
    name: String,
    dialects: vector<DialectInfo>,
    sample_texts: vector<String>,
    created_by: address,
    created_at: u64,
}

/// Dialect information
public struct DialectInfo has store, copy, drop {
    name: String,
    description: String,
}

/// Duration option - SHARED object
public struct DurationOption has key, store {
    id: UID,
    label: String,
    seconds: u64,
    created_by: address,
    created_at: u64,
}

/// Walrus blob object
public struct WalrusBlob has key, store {
    id: UID,
    blob_id: String,
    dataset_id: ID,
    encrypted_at: u64,
}

/// Voice dataset - MUST BE SHARED
public struct VoiceDataset has key {
    id: UID,
    creator: address,
    language: String,
    dialect: String,
    duration_label: String,
    duration_seconds: u64,
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
    expires_at: u64,
    days_purchased: u64,
    discount_applied: u64,
}

/// Bulk subscription - contains multiple dataset subscriptions
public struct BulkSubscription has key, store {
    id: UID,
    subscriber: address,
    dataset_ids: vector<ID>,
    created_at: u64,
    expires_at: u64,
    days_purchased: u64,
    total_price_paid: u64,
    total_discount_applied: u64,
}

/// Admin capability for dataset creator
public struct DatasetCap has key, store {
    id: UID,
    dataset_id: ID,
}

/// Events
public struct CategoryRegistryCreated has copy, drop {
    registry_id: ID,
    admin: address,
    creator_discount_percent: u64,
}

public struct LanguageAdded has copy, drop {
    language: String,
    created_by: address,
}

public struct DialectAdded has copy, drop {
    language: String,
    dialect: String,
    created_by: address,
}

public struct DurationOptionCreated has copy, drop {
    duration_id: ID,
    label: String,
    seconds: u64,
    created_by: address,
}

public struct DatasetCreated has copy, drop {
    dataset_id: ID,
    creator: address,
    language: String,
    dialect: String,
    duration_seconds: u64,
}

public struct SubscriptionPurchased has copy, drop {
    dataset_id: ID,
    subscriber: address,
    creator: address,
    original_price: u64,
    discount_applied: u64,
    final_price: u64,
    days_purchased: u64,
    expires_at: u64,
    is_language_creator: bool,
}

public struct BulkSubscriptionPurchased has copy, drop {
    bulk_subscription_id: ID,
    subscriber: address,
    dataset_count: u64,
    total_original_price: u64,
    total_discount_applied: u64,
    total_final_price: u64,
    days_purchased: u64,
    expires_at: u64,
}

public struct CreatorDiscountUpdated has copy, drop {
    old_discount_percent: u64,
    new_discount_percent: u64,
    updated_by: address,
}

//////////////////////////////////////////
// Initialization

fun init(ctx: &mut TxContext) {
    let registry = CategoryRegistry {
        id: object::new(ctx),
        admin: ctx.sender(),
        languages: vec_map::empty(),
        existing_durations: vec_map::empty(),
        creator_discount_percent: DEFAULT_CREATOR_DISCOUNT_PERCENT,
    };
    
    event::emit(CategoryRegistryCreated {
        registry_id: object::id(&registry),
        admin: ctx.sender(),
        creator_discount_percent: DEFAULT_CREATOR_DISCOUNT_PERCENT,
    });
    
    transfer::share_object(registry);
}

//////////////////////////////////////////
// Category Management

public fun update_creator_discount(
    registry: &mut CategoryRegistry,
    new_discount_percent: u64,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == registry.admin, ENotCategoryAdmin);
    assert!(new_discount_percent <= 100, EInvalidFee);
    
    let old_discount = registry.creator_discount_percent;
    registry.creator_discount_percent = new_discount_percent;
    
    event::emit(CreatorDiscountUpdated {
        old_discount_percent: old_discount,
        new_discount_percent,
        updated_by: ctx.sender(),
    });
}

entry fun update_creator_discount_entry(
    registry: &mut CategoryRegistry,
    new_discount_percent: u64,
    ctx: &mut TxContext,
) {
    update_creator_discount(registry, new_discount_percent, ctx);
}

public fun add_language(
    registry: &mut CategoryRegistry,
    language_name: String,
    sample_texts: vector<String>,
    c: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!vec_map::contains(&registry.languages, &language_name), ELanguageAlreadyExists);
    
    let language_category = LanguageCategory {
        name: language_name,
        dialects: vector::empty(),
        sample_texts,
        created_by: ctx.sender(),
        created_at: c.timestamp_ms(),
    };
    
    vec_map::insert(&mut registry.languages, language_name, language_category);
    
    event::emit(LanguageAdded {
        language: language_name,
        created_by: ctx.sender(),
    });
}

entry fun add_language_entry(
    registry: &mut CategoryRegistry,
    language_name: String,
    sample_texts: vector<String>,
    c: &Clock,
    ctx: &mut TxContext,
) {
    add_language(registry, language_name, sample_texts, c, ctx);
}

public fun add_dialect(
    registry: &mut CategoryRegistry,
    language_name: String,
    dialect_name: String,
    dialect_description: String,
    _c: &Clock,
    ctx: &mut TxContext,
) {
    assert!(vec_map::contains(&registry.languages, &language_name), ELanguageNotFound);
    
    let language = vec_map::get_mut(&mut registry.languages, &language_name);
    
    let mut i = 0;
    while (i < vector::length(&language.dialects)) {
        let existing_dialect = vector::borrow(&language.dialects, i);
        assert!(existing_dialect.name != dialect_name, EDialectAlreadyExists);
        i = i + 1;
    };
    
    let dialect_info = DialectInfo {
        name: dialect_name,
        description: dialect_description,
    };
    
    vector::push_back(&mut language.dialects, dialect_info);
    
    event::emit(DialectAdded {
        language: language_name,
        dialect: dialect_name,
        created_by: ctx.sender(),
    });
}

entry fun add_dialect_entry(
    registry: &mut CategoryRegistry,
    language_name: String,
    dialect_name: String,
    dialect_description: String,
    c: &Clock,
    ctx: &mut TxContext,
) {
    add_dialect(registry, language_name, dialect_name, dialect_description, c, ctx);
}

public fun create_duration_option(
    registry: &mut CategoryRegistry,
    label: String,
    seconds: u64,
    c: &Clock,
    ctx: &mut TxContext,
): DurationOption {
    assert!(!vec_map::contains(&registry.existing_durations, &label), EDurationAlreadyExists);
    
    let duration = DurationOption {
        id: object::new(ctx),
        label,
        seconds,
        created_by: ctx.sender(),
        created_at: c.timestamp_ms(),
    };
    
    let duration_id = object::id(&duration);
    
    vec_map::insert(&mut registry.existing_durations, label, true);
    
    event::emit(DurationOptionCreated {
        duration_id,
        label,
        seconds,
        created_by: ctx.sender(),
    });
    
    duration
}

entry fun create_duration_option_entry(
    registry: &mut CategoryRegistry,
    label: String,
    seconds: u64,
    c: &Clock,
    ctx: &mut TxContext,
) {
    let duration = create_duration_option(registry, label, seconds, c, ctx);
    transfer::share_object(duration);
}

//////////////////////////////////////////
// Pricing

public fun calculate_price(duration_seconds: u64, days: u64): u64 {
    let duration_multiplier = duration_seconds / 30;
    BASE_PRICE_PER_DAY * duration_multiplier * days
}

public fun calculate_creator_price(
    registry: &CategoryRegistry,
    duration_seconds: u64, 
    days: u64
): (u64, u64) {
    let original_price = calculate_price(duration_seconds, days);
    let discount_amount = (original_price * registry.creator_discount_percent) / 100;
    let final_price = original_price - discount_amount;
    (final_price, discount_amount)
}

fun is_language_creator(registry: &CategoryRegistry, language: &String, user: address): bool {
    if (!vec_map::contains(&registry.languages, language)) {
        return false
    };
    let lang_category = vec_map::get(&registry.languages, language);
    lang_category.created_by == user
}

//////////////////////////////////////////
// Dataset Management

public fun create_dataset(
    registry: &CategoryRegistry,
    language: String,
    dialect: String,
    duration: &DurationOption,
    blob_id: String,
    encryption_id: vector<u8>,
    c: &Clock,
    ctx: &mut TxContext,
): DatasetCap {
    assert!(vec_map::contains(&registry.languages, &language), ELanguageNotFound);
    
    let language_cat = vec_map::get(&registry.languages, &language);
    let mut dialect_found = false;
    let mut i = 0;
    while (i < vector::length(&language_cat.dialects)) {
        let d = vector::borrow(&language_cat.dialects, i);
        if (d.name == dialect) {
            dialect_found = true;
            break
        };
        i = i + 1;
    };
    assert!(dialect_found, EDialectNotFound);
    
    let dataset_timestamp = c.timestamp_ms();
    let creator = ctx.sender();
    
    let dataset = VoiceDataset {
        id: object::new(ctx),
        creator,
        language,
        dialect,
        duration_label: duration.label,
        duration_seconds: duration.seconds,
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
        duration_seconds: duration.seconds,
    });
    
    let cap = DatasetCap {
        id: object::new(ctx),
        dataset_id,
    };
    
    transfer::share_object(dataset);
    cap
}

entry fun create_dataset_entry(
    registry: &CategoryRegistry,
    language: String,
    dialect: String,
    duration: &DurationOption,
    blob_id: String,
    encryption_id: vector<u8>,
    c: &Clock,
    ctx: &mut TxContext,
) {
    let cap = create_dataset(registry, language, dialect, duration, blob_id, encryption_id, c, ctx);
    transfer::transfer(cap, ctx.sender());
}

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

//////////////////////////////////////////
// Single Subscription

public fun subscribe(
    registry: &CategoryRegistry,
    payment: Coin<SUI>,
    dataset: &VoiceDataset,
    days: u64,
    c: &Clock,
    ctx: &mut TxContext,
): Subscription {
    assert!(ctx.sender() != dataset.creator, ECannotBuyOwnDataset);
    
    let subscriber = ctx.sender();
    let is_creator = is_language_creator(registry, &dataset.language, subscriber);
    
    let (final_price, discount_amount) = if (is_creator) {
        calculate_creator_price(registry, dataset.duration_seconds, days)
    } else {
        let price = calculate_price(dataset.duration_seconds, days);
        (price, 0)
    };
    
    assert!(payment.value() == final_price, EInvalidFee);
    
    transfer::public_transfer(payment, dataset.creator);
    
    let current_time = c.timestamp_ms();
    let expires_at = current_time + (days * MS_PER_DAY);
    
    let subscription = Subscription {
        id: object::new(ctx),
        dataset_id: object::id(dataset),
        subscriber,
        created_at: current_time,
        expires_at,
        days_purchased: days,
        discount_applied: discount_amount,
    };
    
    event::emit(SubscriptionPurchased {
        dataset_id: object::id(dataset),
        subscriber,
        creator: dataset.creator,
        original_price: calculate_price(dataset.duration_seconds, days),
        discount_applied: discount_amount,
        final_price,
        days_purchased: days,
        expires_at,
        is_language_creator: is_creator,
    });
    
    subscription
}

entry fun subscribe_entry(
    registry: &CategoryRegistry,
    payment: Coin<SUI>,
    dataset: &VoiceDataset,
    days: u64,
    c: &Clock,
    ctx: &mut TxContext,
) {
    transfer::transfer(subscribe(registry, payment, dataset, days, c, ctx), ctx.sender());
}

//////////////////////////////////////////
// Bulk Subscription - Entry functions with variable arguments

// Entry function for 2 datasets
entry fun subscribe_bulk_2(
    registry: &CategoryRegistry,
    mut payment: Coin<SUI>,
    dataset1: &VoiceDataset,
    dataset2: &VoiceDataset,
    days: u64,
    c: &Clock,
    ctx: &mut TxContext,
) {
    let subscriber = ctx.sender();
    let current_time = c.timestamp_ms();
    let expires_at = current_time + (days * MS_PER_DAY);
    
    let mut total_original = 0u64;
    let mut total_discount = 0u64;
    let mut total_final = 0u64;
    let mut dataset_ids = vector::empty<ID>();
    
    // Process dataset 1
    process_dataset_subscription(
        registry, &mut payment, dataset1, days, subscriber, current_time, expires_at,
        &mut total_original, &mut total_discount, &mut total_final, &mut dataset_ids, ctx
    );
    
    // Process dataset 2
    process_dataset_subscription(
        registry, &mut payment, dataset2, days, subscriber, current_time, expires_at,
        &mut total_original, &mut total_discount, &mut total_final, &mut dataset_ids, ctx
    );
    
    // Destroy remaining payment (should be zero)
    assert!(payment.value() == 0, EInsufficientPayment);
    payment.destroy_zero();
    
    // Create bulk subscription record
    let bulk_sub = BulkSubscription {
        id: object::new(ctx),
        subscriber,
        dataset_ids,
        created_at: current_time,
        expires_at,
        days_purchased: days,
        total_price_paid: total_final,
        total_discount_applied: total_discount,
    };
    
    event::emit(BulkSubscriptionPurchased {
        bulk_subscription_id: object::id(&bulk_sub),
        subscriber,
        dataset_count: 2,
        total_original_price: total_original,
        total_discount_applied: total_discount,
        total_final_price: total_final,
        days_purchased: days,
        expires_at,
    });
    
    transfer::transfer(bulk_sub, subscriber);
}

// Entry functions for 3-10 datasets (similar pattern)
entry fun subscribe_bulk_3(
    registry: &CategoryRegistry,
    mut payment: Coin<SUI>,
    d1: &VoiceDataset, d2: &VoiceDataset, d3: &VoiceDataset,
    days: u64, c: &Clock, ctx: &mut TxContext,
) {
    let subscriber = ctx.sender();
    let current_time = c.timestamp_ms();
    let expires_at = current_time + (days * MS_PER_DAY);
    let mut total_original = 0u64;
    let mut total_discount = 0u64;
    let mut total_final = 0u64;
    let mut dataset_ids = vector::empty<ID>();
    
    process_dataset_subscription(registry, &mut payment, d1, days, subscriber, current_time, expires_at, &mut total_original, &mut total_discount, &mut total_final, &mut dataset_ids, ctx);
    process_dataset_subscription(registry, &mut payment, d2, days, subscriber, current_time, expires_at, &mut total_original, &mut total_discount, &mut total_final, &mut dataset_ids, ctx);
    process_dataset_subscription(registry, &mut payment, d3, days, subscriber, current_time, expires_at, &mut total_original, &mut total_discount, &mut total_final, &mut dataset_ids, ctx);
    
    assert!(payment.value() == 0, EInsufficientPayment);
    payment.destroy_zero();
    
    let bulk_sub = BulkSubscription {
        id: object::new(ctx),
        subscriber,
        dataset_ids,
        created_at: current_time,
        expires_at,
        days_purchased: days,
        total_price_paid: total_final,
        total_discount_applied: total_discount,
    };
    
    event::emit(BulkSubscriptionPurchased {
        bulk_subscription_id: object::id(&bulk_sub),
        subscriber,
        dataset_count: 3,
        total_original_price: total_original,
        total_discount_applied: total_discount,
        total_final_price: total_final,
        days_purchased: days,
        expires_at,
    });
    
    transfer::transfer(bulk_sub, subscriber);
}

// Helper function to process each dataset
fun process_dataset_subscription(
    registry: &CategoryRegistry,
    payment: &mut Coin<SUI>,
    dataset: &VoiceDataset,
    days: u64,
    subscriber: address,
    current_time: u64,
    expires_at: u64,
    total_original: &mut u64,
    total_discount: &mut u64,
    total_final: &mut u64,
    dataset_ids: &mut vector<ID>,
    ctx: &mut TxContext,
) {
    assert!(subscriber != dataset.creator, ECannotBuyOwnDataset);
    
    let dataset_id = object::id(dataset);
    vector::push_back(dataset_ids, dataset_id);
    
    let is_creator = is_language_creator(registry, &dataset.language, subscriber);
    let original_price = calculate_price(dataset.duration_seconds, days);
    
    let (final_price, discount_amount) = if (is_creator) {
        calculate_creator_price(registry, dataset.duration_seconds, days)
    } else {
        (original_price, 0)
    };
    
    *total_original = *total_original + original_price;
    *total_discount = *total_discount + discount_amount;
    *total_final = *total_final + final_price;
    
    // Split payment for creator
    let creator_payment = payment.split(final_price, ctx);
    transfer::public_transfer(creator_payment, dataset.creator);
    
    // Create individual subscription
    let subscription = Subscription {
        id: object::new(ctx),
        dataset_id,
        subscriber,
        created_at: current_time,
        expires_at,
        days_purchased: days,
        discount_applied: discount_amount,
    };
    
    event::emit(SubscriptionPurchased {
        dataset_id,
        subscriber,
        creator: dataset.creator,
        original_price,
        discount_applied: discount_amount,
        final_price,
        days_purchased: days,
        expires_at,
        is_language_creator: is_creator,
    });
    
    transfer::transfer(subscription, subscriber);
}

//////////////////////////////////////////
// Access Control

fun approve_internal(
    id: vector<u8>,
    dataset: &VoiceDataset,
    sub: &Subscription,
    c: &Clock,
): bool {
    if (object::id(dataset) != sub.dataset_id) {
        return false
    };
    
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

public fun get_creator_discount_percent(registry: &CategoryRegistry): u64 {
    registry.creator_discount_percent
}

public fun get_dataset_creator(dataset: &VoiceDataset): address {
    dataset.creator
}

public fun get_dataset_duration(dataset: &VoiceDataset): u64 {
    dataset.duration_seconds
}

public fun get_dataset_language(dataset: &VoiceDataset): String {
    dataset.language
}

public fun get_subscription_expiry(sub: &Subscription): u64 {
    sub.expires_at
}

public fun get_subscription_discount(sub: &Subscription): u64 {
    sub.discount_applied
}

public fun is_subscription_active(sub: &Subscription, c: &Clock): bool {
    c.timestamp_ms() <= sub.expires_at
}

public fun get_language_sample_texts(registry: &CategoryRegistry, language: &String): vector<String> {
    assert!(vec_map::contains(&registry.languages, language), ELanguageNotFound);
    let lang_cat = vec_map::get(&registry.languages, language);
    lang_cat.sample_texts
}

public fun get_language_creator(registry: &CategoryRegistry, language: &String): address {
    assert!(vec_map::contains(&registry.languages, language), ELanguageNotFound);
    let lang_cat = vec_map::get(&registry.languages, language);
    lang_cat.created_by
}

public fun check_is_language_creator(
    registry: &CategoryRegistry,
    language: &String,
    user: address
): bool {
    is_language_creator(registry, language, user)
}

public fun get_duration_seconds(duration: &DurationOption): u64 {
    duration.seconds
}

public fun get_duration_label(duration: &DurationOption): String {
    duration.label
}

public fun get_bulk_subscription_dataset_ids(bulk_sub: &BulkSubscription): vector<ID> {
    bulk_sub.dataset_ids
}

public fun get_bulk_subscription_expiry(bulk_sub: &BulkSubscription): u64 {
    bulk_sub.expires_at
}

public fun get_bulk_subscription_total_discount(bulk_sub: &BulkSubscription): u64 {
    bulk_sub.total_discount_applied
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx);
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