import { useState, useEffect } from "react";
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Database, Languages, ShoppingCart, Loader2, Filter, Clock, X, Star, Tag, CheckSquare, Square, Crown, User } from "lucide-react";
import Navigation from "@/components/Navigation";
import spaceBg from "@/assets/space-bg.jpg";
import { Transaction } from "@mysten/sui/transactions";
import { toast } from "sonner";
import { config } from '@/config/env';

const PACKAGE_ID = config.packageId;
const REGISTRY_ID = config.registryId;
const BASE_PRICE_PER_DAY = config.pricing.basePricePerDay;

interface DatasetData {
  id: string;
  creator: string;
  language: string;
  dialect: string;
  durationLabel: string;
  durationSeconds: number;
  blobId: string;
  createdAt: number;
  languageCreator: string;
}

interface LanguageData {
  name: string;
  dialects: string[];
}

const dayOptions = [
  { days: 1, label: "1 Day" },
  { days: 7, label: "7 Days" },
  { days: 30, label: "30 Days" },
  { days: 90, label: "90 Days" },
  { days: 365, label: "1 Year" },
];

const Marketplace = () => {
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const [datasets, setDatasets] = useState<DatasetData[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");
  const [selectedDialect, setSelectedDialect] = useState<string>("");
  const [myDatasets, setMyDatasets] = useState<Set<string>>(new Set());
  const [mySubscriptions, setMySubscriptions] = useState<Set<string>>(new Set());
  const [selectedDatasets, setSelectedDatasets] = useState<Set<string>>(new Set());
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number>(7);
  const [availableLanguages, setAvailableLanguages] = useState<LanguageData[]>([]);
  const [creatorDiscountPercent, setCreatorDiscountPercent] = useState<number>(20);
  const [languageCreators, setLanguageCreators] = useState<Map<string, string>>(new Map());
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  
  // Single purchase state
  const [singlePurchaseDataset, setSinglePurchaseDataset] = useState<DatasetData | null>(null);
  const [showSinglePurchaseModal, setShowSinglePurchaseModal] = useState(false);

  useEffect(() => {
    loadMarketplace();
    const interval = setInterval(loadMarketplace, 10000);
    return () => clearInterval(interval);
  }, [currentAccount?.address]);

  const calculatePrice = (durationSeconds: number, days: number): number => {
    const durationMultiplier = durationSeconds / 30;
    return BASE_PRICE_PER_DAY * durationMultiplier * days;
  };

  const calculateDiscountedPrice = (originalPrice: number, discountPercent: number): { finalPrice: number; discountAmount: number } => {
    const discountAmount = Math.floor((originalPrice * discountPercent) / 100);
    const finalPrice = originalPrice - discountAmount;
    return { finalPrice, discountAmount };
  };

  const formatPrice = (mist: number): string => {
    return (mist / 1_000_000_000).toFixed(4);
  };

  const isLanguageCreator = (language: string): boolean => {
    if (!currentAccount?.address) return false;
    const creator = languageCreators.get(language);
    return creator === currentAccount.address;
  };

  const loadMarketplace = async () => {
    try {
      const registry = await suiClient.getObject({
        id: REGISTRY_ID,
        options: { showContent: true },
      });

      const registryFields = (registry.data?.content as any)?.fields;
      if (registryFields?.creator_discount_percent) {
        setCreatorDiscountPercent(parseInt(registryFields.creator_discount_percent));
      }

      if (registryFields?.languages?.fields?.contents) {
        const languagesMap = registryFields.languages.fields.contents;
        const creatorsMap = new Map<string, string>();
        for (const entry of languagesMap) {
          const langName = entry.fields.key;
          const langData = entry.fields.value.fields;
          creatorsMap.set(langName, langData.created_by);
        }
        setLanguageCreators(creatorsMap);
      }

      const allObjects = await suiClient.queryEvents({
        query: {
          MoveEventType: `${PACKAGE_ID}::voice_marketplace::DatasetCreated`,
        },
        limit: 1000,
      });

      const datasetsData: DatasetData[] = await Promise.all(
        allObjects.data.map(async (event: any) => {
          const datasetId = event.parsedJson.dataset_id;
          
          try {
            const dataset = await suiClient.getObject({
              id: datasetId,
              options: { showContent: true, showOwner: true },
            });

            const fields = (dataset.data?.content as any)?.fields;
            if (!fields) return null;

            const languageCreator = languageCreators.get(fields.language) || "";

            return {
              id: datasetId,
              creator: fields.creator,
              language: fields.language,
              dialect: fields.dialect,
              durationLabel: fields.duration_label,
              durationSeconds: parseInt(fields.duration_seconds),
              blobId: fields.blob_id,
              createdAt: parseInt(fields.created_at),
              languageCreator,
            };
          } catch (err) {
            console.error("Error loading dataset:", datasetId, err);
            return null;
          }
        })
      );

      const validDatasets = datasetsData.filter(Boolean) as DatasetData[];
      setDatasets(validDatasets);

      const languageMap = new Map<string, Set<string>>();
      validDatasets.forEach(dataset => {
        if (!languageMap.has(dataset.language)) {
          languageMap.set(dataset.language, new Set());
        }
        languageMap.get(dataset.language)?.add(dataset.dialect);
      });

      const languages: LanguageData[] = Array.from(languageMap.entries()).map(([name, dialectSet]) => ({
        name,
        dialects: Array.from(dialectSet).sort(),
      }));
      setAvailableLanguages(languages.sort((a, b) => a.name.localeCompare(b.name)));

      if (currentAccount?.address) {
        const myDatasetIds = new Set(
          validDatasets
            .filter(d => d.creator === currentAccount.address)
            .map(d => d.id)
        );
        setMyDatasets(myDatasetIds);

        const subs = await suiClient.getOwnedObjects({
          owner: currentAccount.address,
          options: { showContent: true },
          filter: {
            StructType: `${PACKAGE_ID}::voice_marketplace::Subscription`,
          },
        });

        const subDatasetIds = new Set(
          subs.data
            .map(obj => (obj.data?.content as any)?.fields?.dataset_id)
            .filter(Boolean)
        );
        setMySubscriptions(subDatasetIds);
      }
    } catch (error) {
      console.error("Error loading marketplace:", error);
      toast.error("Failed to load marketplace");
    } finally {
      setLoading(false);
    }
  };

  // Single Purchase Functions
  const openSinglePurchaseModal = (dataset: DatasetData) => {
    setSinglePurchaseDataset(dataset);
    setSelectedDays(7);
    setShowSinglePurchaseModal(true);
  };

  const closeSinglePurchaseModal = () => {
    setShowSinglePurchaseModal(false);
    setSinglePurchaseDataset(null);
    setSelectedDays(7);
  };

  const handleSinglePurchase = async () => {
    if (!currentAccount?.address || !singlePurchaseDataset) {
      toast.error("Please connect your wallet");
      return;
    }

    if (singlePurchaseDataset.creator === currentAccount.address) {
      toast.error("You cannot purchase your own dataset");
      closeSinglePurchaseModal();
      return;
    }

    const userIsCreator = isLanguageCreator(singlePurchaseDataset.language);
    const originalPrice = calculatePrice(singlePurchaseDataset.durationSeconds, selectedDays);
    const { finalPrice } = userIsCreator 
      ? calculateDiscountedPrice(originalPrice, creatorDiscountPercent)
      : { finalPrice: originalPrice };

    setPurchasing(true);

    try {
      const tx = new Transaction();
      tx.setGasBudget(10000000);

      const [paymentCoin] = tx.splitCoins(tx.gas, [finalPrice]);

      tx.moveCall({
        target: `${PACKAGE_ID}::voice_marketplace::subscribe_entry`,
        arguments: [
          tx.object(REGISTRY_ID),
          paymentCoin,
          tx.object(singlePurchaseDataset.id),
          tx.pure.u64(selectedDays),
          tx.object('0x6'),
        ],
      });

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: (result) => {
            console.log("Single purchase successful:", result.digest);
            toast.success(`🎉 Subscription purchased for ${selectedDays} day(s)!`);
            closeSinglePurchaseModal();
            loadMarketplace();
          },
          onError: (error) => {
            console.error("Purchase error:", error);
            toast.error("Purchase failed: " + (error?.message || 'Unknown error'));
          },
        }
      );
    } catch (error: any) {
      console.error("Purchase error:", error);
      toast.error(`Purchase failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setPurchasing(false);
    }
  };

  // Bulk Purchase Functions
  const toggleDatasetSelection = (datasetId: string) => {
    const newSelection = new Set(selectedDatasets);
    if (newSelection.has(datasetId)) {
      newSelection.delete(datasetId);
    } else {
      newSelection.add(datasetId);
    }
    setSelectedDatasets(newSelection);
  };

  const selectAllFiltered = () => {
    const selectableDatasets = filteredDatasets.filter(d => 
      !myDatasets.has(d.id) && 
      !mySubscriptions.has(d.id) && 
      d.creator !== currentAccount?.address
    );
    setSelectedDatasets(new Set(selectableDatasets.map(d => d.id)));
    toast.success(`Selected ${selectableDatasets.length} datasets`);
  };

  const clearSelection = () => {
    setSelectedDatasets(new Set());
  };

  const openBulkPurchaseModal = () => {
    if (selectedDatasets.size === 0) {
      toast.error("Please select at least one dataset");
      return;
    }
    setSelectedDays(7);
    setShowPurchaseModal(true);
  };

  const closePurchaseModal = () => {
    setShowPurchaseModal(false);
    setSelectedDays(7);
  };

  const calculateBulkPrice = () => {
    const selectedDatasetsList = Array.from(selectedDatasets)
      .map(id => datasets.find(d => d.id === id))
      .filter(Boolean) as DatasetData[];

    let totalOriginal = 0;
    let totalDiscount = 0;

    selectedDatasetsList.forEach(dataset => {
      const originalPrice = calculatePrice(dataset.durationSeconds, selectedDays);
      totalOriginal += originalPrice;

      if (isLanguageCreator(dataset.language)) {
        const { discountAmount } = calculateDiscountedPrice(originalPrice, creatorDiscountPercent);
        totalDiscount += discountAmount;
      }
    });

    return {
      totalOriginal,
      totalDiscount,
      totalFinal: totalOriginal - totalDiscount,
    };
  };

  const handleBulkPurchase = async () => {
    if (!currentAccount?.address || selectedDatasets.size === 0) {
      toast.error("Please connect your wallet and select datasets");
      return;
    }

    const selectedDatasetsList = Array.from(selectedDatasets)
      .map(id => datasets.find(d => d.id === id))
      .filter(Boolean) as DatasetData[];

    if (selectedDatasetsList.length < 2 || selectedDatasetsList.length > 10) {
      toast.error("Please select between 2 and 10 datasets for bulk purchase");
      return;
    }

    const { totalFinal } = calculateBulkPrice();

    setPurchasing(true);

    try {
      const tx = new Transaction();
      tx.setGasBudget(30000000);

      const [paymentCoin] = tx.splitCoins(tx.gas, [totalFinal]);

      const count = selectedDatasetsList.length;
      const functionName = `subscribe_bulk_${count}`;

      const args = [
        tx.object(REGISTRY_ID),
        paymentCoin,
        ...selectedDatasetsList.map(d => tx.object(d.id)),
        tx.pure.u64(selectedDays),
        tx.object('0x6'),
      ];

      tx.moveCall({
        target: `${PACKAGE_ID}::voice_marketplace::${functionName}`,
        arguments: args,
      });

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: (result) => {
            console.log("Bulk purchase successful:", result.digest);
            toast.success(`🎉 Bulk subscription purchased for ${selectedDatasets.size} datasets!`);
            closePurchaseModal();
            clearSelection();
            setBulkSelectMode(false);
            loadMarketplace();
          },
          onError: (error) => {
            console.error("Purchase error:", error);
            toast.error("Purchase failed: " + (error?.message || 'Unknown error'));
          },
        }
      );
    } catch (error: any) {
      console.error("Purchase error:", error);
      toast.error(`Purchase failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setPurchasing(false);
    }
  };

  const filteredDatasets = datasets.filter(d => {
    if (selectedLanguage && d.language !== selectedLanguage) return false;
    if (selectedDialect && d.dialect !== selectedDialect) return false;
    return true;
  });

  const getButtonState = (dataset: DatasetData) => {
    if (myDatasets.has(dataset.id)) {
      return { text: "YOUR DATASET", disabled: true, variant: "outline" as const };
    }
    if (mySubscriptions.has(dataset.id)) {
      return { text: "OWNED", disabled: true, variant: "outline" as const };
    }
    return { 
      text: "PURCHASE", 
      disabled: false, 
      variant: "default" as const 
    };
  };

  const availableDialects = selectedLanguage 
    ? availableLanguages.find(l => l.name === selectedLanguage)?.dialects || []
    : [];

  const getPriceDisplay = (dataset: DatasetData) => {
    const pricePerDay = calculatePrice(dataset.durationSeconds, 1);
    const userIsCreator = isLanguageCreator(dataset.language);
    
    if (userIsCreator) {
      const { finalPrice, discountAmount } = calculateDiscountedPrice(pricePerDay, creatorDiscountPercent);
      return {
        hasDiscount: true,
        originalPrice: formatPrice(pricePerDay),
        finalPrice: formatPrice(finalPrice),
        discountPercent: creatorDiscountPercent,
      };
    }
    
    return {
      hasDiscount: false,
      originalPrice: formatPrice(pricePerDay),
      finalPrice: formatPrice(pricePerDay),
      discountPercent: 0,
    };
  };

  const isSelectable = (dataset: DatasetData) => {
    return !myDatasets.has(dataset.id) && 
           !mySubscriptions.has(dataset.id) && 
           dataset.creator !== currentAccount?.address;
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div 
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: `url(${spaceBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
        }}
      />
      
      <div className="fixed inset-0 scanlines pointer-events-none z-10" />
      
      <Navigation />

      <div className="relative z-20 pt-24 pb-12 px-4">
        <div className="container mx-auto max-w-7xl">
          {/* Header Section */}
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-6xl font-bold neon-text glitch mb-4">
              VOICE MARKETPLACE
            </h1>
          
          </div>

          {/* Bulk Select Controls */}
          {bulkSelectMode && (
            <Card className="p-4 mb-6 bg-gradient-to-r from-primary/20 to-secondary/20 border-2 border-primary/50 neon-border">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="bg-primary text-primary-foreground px-3 py-1 rounded-full font-bold">
                    {selectedDatasets.size} SELECTED
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={selectAllFiltered}
                      variant="outline"
                      size="sm"
                      disabled={filteredDatasets.filter(isSelectable).length === 0}
                      className="pixel-border"
                    >
                      Select All
                    </Button>
                    <Button
                      onClick={clearSelection}
                      variant="ghost"
                      size="sm"
                      disabled={selectedDatasets.size === 0}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {selectedDatasets.size > 0 && (
                    <div className="text-sm text-muted-foreground">
                      {selectedDatasets.size < 2 ? (
                        <span className="text-amber-500">Select {2 - selectedDatasets.size} more</span>
                      ) : selectedDatasets.size > 10 ? (
                        <span className="text-red-500">Max 10 datasets</span>
                      ) : (
                        <span className="text-green-500">Ready to purchase</span>
                      )}
                    </div>
                  )}
                  <Button
                    onClick={openBulkPurchaseModal}
                    disabled={selectedDatasets.size < 2 || selectedDatasets.size > 10}
                    className="font-bold pixel-border bg-gradient-to-r from-primary to-secondary text-white"
                    size="lg"
                  >
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Purchase {selectedDatasets.size} Datasets
                  </Button>
                </div>
              </div>
            </Card>
          )}
    
          {/* Filters Section */}
          <Card className="p-6 mb-8 neon-border bg-card/80 backdrop-blur">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-primary/20 p-2 rounded-lg">
                  <Filter className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-primary">Filters & Selection</h2>
                  <p className="text-sm text-muted-foreground">Filter datasets and manage bulk purchases</p>
                </div>
              </div>
              
              <Button
                onClick={() => setBulkSelectMode(!bulkSelectMode)}
                variant={bulkSelectMode ? "default" : "outline"}
                className="font-bold pixel-border bg-gradient-to-r from-primary to-secondary text-white min-w-[140px]"
                size="lg"
              >
                {bulkSelectMode ? (
                  <>
                    <X className="w-4 h-4 mr-2" />
                    Exit Bulk
                  </>
                ) : (
                  <>
                    <CheckSquare className="w-4 h-4 mr-2" />
                    Bulk Select
                  </>
                )}
              </Button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-bold text-primary bg-primary/10 px-3 py-1 rounded-full">Language:</span>
                <Button
                  variant={selectedLanguage === "" ? "default" : "outline"}
                  onClick={() => {
                    setSelectedLanguage("");
                    setSelectedDialect("");
                  }}
                  size="sm"
                  className="pixel-border"
                >
                  🌍 All Languages
                </Button>
                {availableLanguages.map(lang => {
                  const userCreatedThis = isLanguageCreator(lang.name);
                  return (
                    <Button
                      key={lang.name}
                      variant={selectedLanguage === lang.name ? "default" : "outline"}
                      onClick={() => {
                        setSelectedLanguage(lang.name);
                        setSelectedDialect("");
                      }}
                      size="sm"
                      className={`pixel-border ${userCreatedThis ? 'relative border-2 border-accent bg-accent/20' : ''}`}
                    >
                      {lang.name}
                      {userCreatedThis && <Crown className="w-3 h-3 ml-1 text-accent fill-accent" />}
                      <span className="ml-1 text-xs opacity-70 bg-primary/20 px-1 rounded">({lang.dialects.length})</span>
                    </Button>
                  );
                })}
              </div>

              {selectedLanguage && availableDialects.length > 0 && (
                <div className="flex items-center gap-3 flex-wrap border-t border-primary/20 pt-4">
                  <span className="text-sm font-bold text-secondary bg-secondary/10 px-3 py-1 rounded-full">Dialect:</span>
                  <Button
                    variant={selectedDialect === "" ? "default" : "outline"}
                    onClick={() => setSelectedDialect("")}
                    size="sm"
                    className="pixel-border"
                  >
                    🗣️ All Dialects
                  </Button>
                  {availableDialects.map(dialect => (
                    <Button
                      key={dialect}
                      variant={selectedDialect === dialect ? "default" : "outline"}
                      onClick={() => setSelectedDialect(dialect)}
                      size="sm"
                      className="pixel-border"
                    >
                      {dialect}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            {(selectedLanguage || selectedDialect) && (
              <div className="mt-4 pt-4 border-t border-primary/20">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">Active filters:</span>
                  {selectedLanguage && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setSelectedLanguage("");
                        setSelectedDialect("");
                      }}
                      className="h-7 text-xs bg-primary/20"
                    >
                      {selectedLanguage}
                      <X className="w-3 h-3 ml-1" />
                    </Button>
                  )}
                  {selectedDialect && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSelectedDialect("")}
                      className="h-7 text-xs bg-secondary/20"
                    >
                      {selectedDialect}
                      <X className="w-3 h-3 ml-1" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Card>

          {/* Datasets Grid */}
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
            </div>
          ) : filteredDatasets.length === 0 ? (
            <Card className="p-8 text-center neon-border bg-card/80 backdrop-blur">
              <Database className="w-16 h-16 text-secondary mx-auto mb-4" />
              <p className="text-xl text-primary mb-2">No Datasets Available</p>
              <p className="text-muted-foreground">
                {selectedLanguage || selectedDialect
                  ? `No datasets found for the selected filters`
                  : "Be the first to record and publish a voice dataset!"}
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredDatasets.map((dataset) => {
                const buttonState = getButtonState(dataset);
                const priceInfo = getPriceDisplay(dataset);
                const isSelected = selectedDatasets.has(dataset.id);
                const canSelect = isSelectable(dataset);
                
                return (
                  <Card
                    key={dataset.id}
                    className={`p-6 relative transition-all duration-300 neon-border bg-card/80 backdrop-blur hover:shadow-xl hover:scale-[1.02] ${
                      priceInfo.hasDiscount ? 'border-accent border-2' : ''
                    } ${
                      bulkSelectMode && canSelect ? 'cursor-pointer ring-2 ring-transparent hover:ring-primary/50' : ''
                    } ${
                      isSelected ? 'ring-2 ring-primary shadow-xl scale-[1.02]' : ''
                    }`}
                    onClick={() => {
                      if (bulkSelectMode && canSelect) {
                        toggleDatasetSelection(dataset.id);
                      }
                    }}
                  >
                    {/* Selection Indicator */}
                    {bulkSelectMode && (
                      <div className="absolute top-4 left-4 z-10">
                        {canSelect ? (
                          <div className={`p-1 rounded-full ${isSelected ? 'bg-primary text-white' : 'bg-muted/50 text-muted-foreground'}`}>
                            {isSelected ? (
                              <CheckSquare className="w-5 h-5" />
                            ) : (
                              <Square className="w-5 h-5" />
                            )}
                          </div>
                        ) : (
                          <div className="bg-muted text-muted-foreground px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                            {myDatasets.has(dataset.id) ? (
                              <>
                                <User className="w-3 h-3" />
                                YOURS
                              </>
                            ) : (
                              <>
                                <Crown className="w-3 h-3" />
                                OWNED
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Discount Badge */}
                    {priceInfo.hasDiscount && (
                      <div className="absolute top-2 right-2 bg-gradient-to-r from-accent to-primary text-background px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-lg">
                        <Tag className="w-3 h-3" />
                        {priceInfo.discountPercent}% OFF
                      </div>
                    )}
                    
                    {/* Dataset Content */}
                    <div className={`flex items-start justify-between mb-4 ${bulkSelectMode ? 'ml-10' : ''}`}>
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-primary mb-2 leading-tight">
                          {dataset.language} - {dataset.dialect}
                        </h3>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Clock className="w-3 h-3" />
                            <span>{dataset.durationLabel}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span>Created: {new Date(dataset.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="bg-primary/10 p-2 rounded-lg">
                        <Languages className="w-6 h-6 text-primary" />
                      </div>
                    </div>

                    {/* Dataset Details */}
                    <div className="space-y-3 mb-4 text-sm">
                      <div className="flex items-center justify-between py-2 border-b border-primary/10">
                        <span className="text-foreground/70">Format:</span>
                        <span className="text-primary font-bold">MP3 Encrypted</span>
                      </div>
                      <div className="flex items-center justify-between py-2 border-b border-primary/10">
                        <span className="text-foreground/70">Storage:</span>
                        <span className="text-primary font-bold">Walrus</span>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-foreground/70">Price/Day:</span>
                        <div className="flex flex-col items-end">
                          {priceInfo.hasDiscount ? (
                            <>
                              <span className="text-muted-foreground line-through text-xs">
                                {priceInfo.originalPrice} SUI
                              </span>
                              <span className="text-accent font-bold text-lg">
                                {priceInfo.finalPrice} SUI
                              </span>
                            </>
                          ) : (
                            <span className="text-accent font-bold text-lg">
                              {priceInfo.finalPrice} SUI
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Purchase Button */}
                    {!bulkSelectMode && (
                      <Button
                        onClick={() => !buttonState.disabled && openSinglePurchaseModal(dataset)}
                        disabled={buttonState.disabled}
                        variant={buttonState.variant}
                        className={`w-full font-bold py-3 pixel-border transition-all ${
                          buttonState.disabled 
                            ? "opacity-50 cursor-not-allowed" 
                            : priceInfo.hasDiscount
                            ? "bg-gradient-to-r from-accent to-primary text-background hover:shadow-lg hover:scale-[1.02]"
                            : "bg-gradient-to-r from-primary to-secondary text-background hover:shadow-lg hover:scale-[1.02]"
                        }`}
                      >
                        <ShoppingCart className="w-5 h-5 mr-2" />
                        {buttonState.text}
                      </Button>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Single Purchase Modal */}
      {showSinglePurchaseModal && singlePurchaseDataset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <Card className="p-6 max-w-md w-full mx-4 neon-border bg-card/90 backdrop-blur">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-primary">Purchase Subscription</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={closeSinglePurchaseModal}
                className="h-8 w-8 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {isLanguageCreator(singlePurchaseDataset.language) && (
              <div className="mb-6 p-4 bg-accent/20 border-2 border-accent rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Star className="w-5 h-5 text-accent" />
                  <span className="font-bold text-accent">Creator Discount Active!</span>
                </div>
                <p className="text-sm text-foreground">
                  As creator of {singlePurchaseDataset.language}, you get {creatorDiscountPercent}% off!
                </p>
              </div>
            )}

            <div className="space-y-6 mb-6">
              <div className="bg-secondary/20 p-4 rounded-lg border border-primary/20">
                <h4 className="font-bold text-primary text-lg mb-1">
                  {singlePurchaseDataset.language} - {singlePurchaseDataset.dialect}
                </h4>
                <p className="text-sm text-muted-foreground">Duration: {singlePurchaseDataset.durationLabel}</p>
              </div>

              <div>
                <label className="text-sm font-bold text-primary mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Select Subscription Duration:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {dayOptions.map(option => (
                    <Button
                      key={option.days}
                      variant={selectedDays === option.days ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedDays(option.days)}
                      className="text-xs py-3 h-auto font-medium pixel-border"
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="bg-primary/10 p-4 rounded-lg border border-primary/20">
                <p className="text-sm text-muted-foreground mb-1 text-center">Total Price</p>
                
                {isLanguageCreator(singlePurchaseDataset.language) ? (
                  <>
                    <div className="text-center mb-2">
                      <p className="text-lg text-muted-foreground line-through">
                        {formatPrice(calculatePrice(singlePurchaseDataset.durationSeconds, selectedDays))} SUI
                      </p>
                      <p className="text-2xl font-bold text-accent">
                        {formatPrice(
                          calculateDiscountedPrice(
                            calculatePrice(singlePurchaseDataset.durationSeconds, selectedDays),
                            creatorDiscountPercent
                          ).finalPrice
                        )} SUI
                      </p>
                      <p className="text-xs text-accent font-bold mt-1">
                        Save {formatPrice(
                          calculateDiscountedPrice(
                            calculatePrice(singlePurchaseDataset.durationSeconds, selectedDays),
                            creatorDiscountPercent
                          ).discountAmount
                        )} SUI
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-2xl font-bold text-accent text-center mb-2">
                    {formatPrice(calculatePrice(singlePurchaseDataset.durationSeconds, selectedDays))} SUI
                  </p>
                )}
                
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{selectedDays} day(s)</span>
                  <span>×</span>
                  <span>{formatPrice(calculatePrice(singlePurchaseDataset.durationSeconds, 1))} SUI/day</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={closeSinglePurchaseModal}
                className="flex-1 py-3 font-medium pixel-border"
                disabled={purchasing}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSinglePurchase}
                disabled={purchasing}
                className="flex-1 py-3 font-bold bg-gradient-to-r from-primary to-secondary text-background pixel-border"
              >
                {purchasing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Confirm Purchase
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Bulk Purchase Modal */}
      {showPurchaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <Card className="p-6 max-w-2xl w-full mx-4 neon-border bg-card/90 backdrop-blur">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-primary">Bulk Purchase Subscription</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={closePurchaseModal}
                className="h-8 w-8 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-6 mb-6">
              <div className="bg-secondary/20 p-4 rounded-lg border border-primary/20">
                <h4 className="font-bold text-primary text-lg mb-3">
                  Selected Datasets ({selectedDatasets.size})
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {Array.from(selectedDatasets).map(id => {
                    const dataset = datasets.find(d => d.id === id);
                    if (!dataset) return null;
                    const priceInfo = getPriceDisplay(dataset);
                    return (
                      <div key={id} className="flex items-center justify-between text-sm p-2 bg-background/50 rounded">
                        <span className="font-medium">
                          {dataset.language} - {dataset.dialect} ({dataset.durationLabel})
                        </span>
                        {priceInfo.hasDiscount && (
                          <span className="text-accent text-xs font-bold">
                            {priceInfo.discountPercent}% OFF
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-sm font-bold text-primary mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Select Subscription Duration:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {dayOptions.map(option => (
                    <Button
                      key={option.days}
                      variant={selectedDays === option.days ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedDays(option.days)}
                      className="text-xs py-3 h-auto font-medium pixel-border"
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="bg-primary/10 p-4 rounded-lg border border-primary/20">
                <p className="text-sm text-muted-foreground mb-1 text-center">Total Price</p>
                
                {(() => {
                  const { totalOriginal, totalDiscount, totalFinal } = calculateBulkPrice();
                  return totalDiscount > 0 ? (
                    <>
                      <div className="text-center mb-2">
                        <p className="text-lg text-muted-foreground line-through">
                          {formatPrice(totalOriginal)} SUI
                        </p>
                        <p className="text-2xl font-bold text-accent">
                          {formatPrice(totalFinal)} SUI
                        </p>
                        <p className="text-xs text-accent font-bold mt-1">
                          Save {formatPrice(totalDiscount)} SUI (Creator Discount Applied)
                        </p>
                      </div>
                    </>
                  ) : (
                    <p className="text-2xl font-bold text-accent text-center mb-2">
                      {formatPrice(totalFinal)} SUI
                    </p>
                  );
                })()}
                
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{selectedDatasets.size} dataset(s)</span>
                  <span>×</span>
                  <span>{selectedDays} day(s)</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={closePurchaseModal}
                className="flex-1 py-3 font-medium pixel-border"
                disabled={purchasing}
              >
                Cancel
              </Button>
              <Button
                onClick={handleBulkPurchase}
                disabled={purchasing}
                className="flex-1 py-3 font-bold bg-gradient-to-r from-primary to-secondary text-background pixel-border"
              >
                {purchasing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Confirm Bulk Purchase
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Marketplace;