// Voice Data Marketplace with Dynamic Pricing, On-Chain Categories, and Creator Discounts
module starfish::voice_marketplace;

use std::string::String;
use sui::{clock::Clock, coin::Coin, dynamic_field as df, sui::SUI, event, vec_map::{Self, VecMap}};

const EInvalidCap: u64 = 0;
const EInvalidFee: u64 = 1;
const ENoAccess: u64 = 2;
const ECannotBuyOwnDataset: u64 = 3;
const ELanguageNotFound: u64 = 4;
const EDialectNotFound: u64 = 5;
const EDurationNotFound: u64 = 6;
const ENotCategoryAdmin: u64 = 7;
const ELanguageAlreadyExists: u64 = 8;
const EDialectAlreadyExists: u64 = 9;
const EDurationAlreadyExists: u64 = 10;

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
    existing_durations: VecMap<String, bool>, // Track duration labels to prevent duplicates
    creator_discount_percent: u64, // Discount percentage for language creators (0-100)
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
    discount_applied: u64, // Amount of discount applied in MIST
}

/// Admin capability for dataset creator
public struct DatasetCap has key, store {
    id: UID,
    dataset_id: ID,
}

/// Event emitted when category registry is created
public struct CategoryRegistryCreated has copy, drop {
    registry_id: ID,
    admin: address,
    creator_discount_percent: u64,
}

/// Event emitted when language is added
public struct LanguageAdded has copy, drop {
    language: String,
    created_by: address,
}

/// Event emitted when dialect is added
public struct DialectAdded has copy, drop {
    language: String,
    dialect: String,
    created_by: address,
}

/// Event emitted when duration option is created
public struct DurationOptionCreated has copy, drop {
    duration_id: ID,
    label: String,
    seconds: u64,
    created_by: address,
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
    original_price: u64,
    discount_applied: u64,
    final_price: u64,
    days_purchased: u64,
    expires_at: u64,
    is_language_creator: bool,
}

/// Event emitted when creator discount is updated
public struct CreatorDiscountUpdated has copy, drop {
    old_discount_percent: u64,
    new_discount_percent: u64,
    updated_by: address,
}

//////////////////////////////////////////
// Category Management

/// Initialize the category registry (called once on deployment)
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

/// Update the creator discount percentage (admin only)
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

/// Add a new language category
public fun add_language(
    registry: &mut CategoryRegistry,
    language_name: String,
    sample_texts: vector<String>,
    c: &Clock,
    ctx: &mut TxContext,
) {
    // Check if language already exists
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

/// Add a dialect to an existing language
public fun add_dialect(
    registry: &mut CategoryRegistry,
    language_name: String,
    dialect_name: String,
    dialect_description: String,
    c: &Clock,
    ctx: &mut TxContext,
) {
    assert!(vec_map::contains(&registry.languages, &language_name), ELanguageNotFound);
    
    let language = vec_map::get_mut(&mut registry.languages, &language_name);
    
    // Check if dialect already exists in this language
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

/// Create a new duration option
public fun create_duration_option(
    registry: &mut CategoryRegistry,
    label: String,
    seconds: u64,
    c: &Clock,
    ctx: &mut TxContext,
): DurationOption {
    // Check if duration label already exists
    assert!(!vec_map::contains(&registry.existing_durations, &label), EDurationAlreadyExists);
    
    let duration = DurationOption {
        id: object::new(ctx),
        label,
        seconds,
        created_by: ctx.sender(),
        created_at: c.timestamp_ms(),
    };
    
    let duration_id = object::id(&duration);
    
    // Mark this duration label as existing
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
// Pricing Logic

/// Calculate price based on duration and days
/// Formula: (duration_seconds / 30) * BASE_PRICE_PER_DAY * days
public fun calculate_price(duration_seconds: u64, days: u64): u64 {
    let duration_multiplier = duration_seconds / 30;
    BASE_PRICE_PER_DAY * duration_multiplier * days
}

/// Calculate discounted price for language creators
/// Returns (final_price, discount_amount)
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

/// Check if an address is the creator of a language
fun is_language_creator(registry: &CategoryRegistry, language: &String, user: address): bool {
    if (!vec_map::contains(&registry.languages, language)) {
        return false
    };
    let lang_category = vec_map::get(&registry.languages, language);
    lang_category.created_by == user
}

//////////////////////////////////////////
// Dataset Management

/// Create a new voice dataset with validated categories
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
    // Validate language exists
    assert!(vec_map::contains(&registry.languages, &language), ELanguageNotFound);
    
    // Validate dialect exists for this language
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
/// Automatically applies discount if subscriber is the language creator
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
    
    // Calculate price (with discount if applicable)
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